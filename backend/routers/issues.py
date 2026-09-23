from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload, aliased

from database import get_db
import models, schemas, auth, status_codes
from .invoices import _invoice_base_query, _to_invoice_out

router = APIRouter(prefix="/issues", tags=["issues"])

VALID_ISS_TRADE_CODES = {1, 55, 99}  # transfer, adjust, wasted

# For non-transfer codes, the unit leaves inventory entirely and gets a terminal status.
# 1 (transfer) is handled separately since the unit moves (via an in-transit state)
# rather than terminating.
TERMINAL_STATUS_BY_TRADE_CODE = {
    55: status_codes.PRODUCT_UNIT_ISSUED,
    99: status_codes.PRODUCT_UNIT_WASTED,
}

TransferConfig = aliased(models.Config)


def _to_issue_out(
    issue: models.Issue, trade_code_label: str | None, transfer_status_label: str | None
) -> schemas.IssueOut:
    return schemas.IssueOut(
        id=issue.id,
        issue_no=issue.issue_no,
        location_id=issue.location_id,
        location_name=issue.location.name if issue.location else None,
        to_location_id=issue.to_location_id,
        to_location_name=issue.to_location.name if issue.to_location else None,
        trade_code=issue.trade_code,
        trade_code_label=trade_code_label,
        transfer_status=issue.transfer_status,
        transfer_status_label=transfer_status_label,
        remark=issue.remark,
        issue_date=str(issue.issue_date),
        created_by=issue.created_by,
        items=[
            schemas.IssueItemOut(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else None,
                serial_number=item.product_unit.serial_number if item.product_unit else None,
                quantity=item.quantity,
                unit_price=float(item.unit_price) if item.unit_price is not None else None,
                received_qty=item.received_qty,
            )
            for item in issue.items
        ],
    )


def _issue_query(db: Session):
    """Issue query joined to config twice -- once for trade_code_label, once for
    transfer_status_label -- so both labels come back in the same round trip."""
    return (
        db.query(models.Issue, models.Config.value, TransferConfig.value)
        .outerjoin(
            models.Config,
            (models.Config.category == "issue") & (models.Config.key == models.Issue.trade_code),
        )
        .outerjoin(
            TransferConfig,
            (TransferConfig.category == "transfer_status") & (TransferConfig.key == models.Issue.transfer_status),
        )
        .options(
            joinedload(models.Issue.items).joinedload(models.IssueItem.product),
            joinedload(models.Issue.items).joinedload(models.IssueItem.product_unit),
            joinedload(models.Issue.location),
            joinedload(models.Issue.to_location),
        )
    )


@router.get("", response_model=list[schemas.IssueOut])
def list_issues(
    location_id: int | None = Query(None),
    trade_code: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    query = _issue_query(db)
    if location_id:
        query = query.filter(models.Issue.location_id == location_id)
    if trade_code:
        query = query.filter(models.Issue.trade_code == trade_code)

    rows = query.order_by(models.Issue.created_at.desc()).all()
    return [_to_issue_out(i, trade_label, transfer_label) for i, trade_label, transfer_label in rows]


@router.get("/{issue_id}", response_model=schemas.IssueOut)
def get_issue(issue_id: int, db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    row = _issue_query(db).filter(models.Issue.id == issue_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Issue not found")
    issue, trade_label, transfer_label = row
    return _to_issue_out(issue, trade_label, transfer_label)


@router.post("", response_model=schemas.IssueOut, status_code=201)
def create_issue(
    payload: schemas.IssueCreate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    if payload.trade_code not in VALID_ISS_TRADE_CODES:
        raise HTTPException(status_code=400, detail=f"trade_code must be one of {sorted(VALID_ISS_TRADE_CODES)}")

    is_transfer = payload.trade_code == 1

    if is_transfer:
        if not payload.to_location_id:
            raise HTTPException(status_code=400, detail="to_location_id is required for a transfer (trade_code 1)")
        if payload.to_location_id == payload.location_id:
            raise HTTPException(status_code=400, detail="Destination location must be different from the source location")
        to_location = db.query(models.Location).filter(models.Location.id == payload.to_location_id).first()
        if not to_location:
            raise HTTPException(status_code=404, detail="Destination location not found")
    elif payload.to_location_id:
        raise HTTPException(status_code=400, detail="to_location_id is only used with trade_code 1 (transfer)")

    existing = db.query(models.Issue).filter(models.Issue.issue_no == payload.issue_no).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Issue number '{payload.issue_no}' already exists")

    location = db.query(models.Location).filter(models.Location.id == payload.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    if not payload.items:
        raise HTTPException(status_code=400, detail="Issue must have at least one item")

    # ---- Pass 1: validate every line before touching any data ----
    resolved = []  # (product, unit_or_balance, quantity)
    for line in payload.items:
        product = db.query(models.Product).filter(models.Product.id == line.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product id {line.product_id} not found")

        if product.is_serialized:
            if not line.serial_number:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{product.name}' is serialized — serial_number is required",
                )
            unit = (
                db.query(models.ProductUnit)
                .filter(
                    models.ProductUnit.serial_number == line.serial_number,
                    models.ProductUnit.status == status_codes.PRODUCT_UNIT_IN_STOCK,
                    models.ProductUnit.current_location_id == payload.location_id,
                )
                .first()
            )
            if not unit:
                raise HTTPException(
                    status_code=400,
                    detail=f"Serial '{line.serial_number}' is not in stock at this location",
                )
            resolved.append((product, unit, 1))
        else:
            qty = line.quantity or 0
            if qty <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{product.name}' is non-serialized — quantity must be greater than 0",
                )
            balance = (
                db.query(models.StockBalance)
                .filter(
                    models.StockBalance.product_id == product.id,
                    models.StockBalance.location_id == payload.location_id,
                )
                .first()
            )
            available = balance.quantity if balance else 0
            if available < qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Only {available} unit(s) of '{product.name}' available at this location",
                )
            resolved.append((product, balance, qty))

    # ---- Pass 2: everything validated, now apply changes ----
    issue = models.Issue(
        issue_no=payload.issue_no,
        location_id=payload.location_id,
        to_location_id=payload.to_location_id if is_transfer else None,
        trade_code=payload.trade_code,
        transfer_status=status_codes.TRANSFER_IN_TRANSIT if is_transfer else None,
        remark=payload.remark,
        created_by=current_user.id,
    )
    db.add(issue)
    db.flush()  # get issue.id

    for product, unit_or_balance, qty in resolved:
        if product.is_serialized:
            unit = unit_or_balance
            db.add(
                models.IssueItem(
                    issue_id=issue.id,
                    product_id=product.id,
                    product_unit_id=unit.id,
                    quantity=1,
                    unit_price=product.price,
                )
            )
            db.add(
                models.StockTransaction(
                    trade_type="ISS",
                    trade_code=payload.trade_code,
                    product_id=product.id,
                    location_id=payload.location_id,
                    serial_number=unit.serial_number,
                    quantity=1,
                    ref_type="issue",
                    ref_id=issue.id,
                    created_by=current_user.id,
                )
            )

            if is_transfer:
                # The unit has left the shelf but hasn't arrived anywhere yet.
                # current_location_id deliberately stays at the origin -- it's
                # the *last confirmed* location, not a live GPS position -- and
                # only moves to the destination when receive/scan-serial below
                # confirms physical arrival. No destination-side StockTransaction
                # is created here; that happens at confirmation too.
                unit.status = status_codes.PRODUCT_UNIT_IN_TRANSIT
            else:
                unit.status = TERMINAL_STATUS_BY_TRADE_CODE[payload.trade_code]

        else:
            balance = unit_or_balance
            balance.quantity -= qty
            db.add(
                models.IssueItem(
                    issue_id=issue.id,
                    product_id=product.id,
                    product_unit_id=None,
                    quantity=qty,
                    unit_price=product.price,
                )
            )
            db.add(
                models.StockTransaction(
                    trade_type="ISS",
                    trade_code=payload.trade_code,
                    product_id=product.id,
                    location_id=payload.location_id,
                    serial_number=None,
                    quantity=qty,
                    ref_type="issue",
                    ref_id=issue.id,
                    created_by=current_user.id,
                )
            )
            # For a transfer, the destination balance is intentionally left
            # untouched here -- the qty is "on the truck," credited to nobody's
            # shelf until receive/add-quantity below confirms arrival.

    db.commit()

    row = _issue_query(db).filter(models.Issue.id == issue.id).first()
    issue, trade_label, transfer_label = row
    return _to_issue_out(issue, trade_label, transfer_label)


# ---------------- Transfer receiving (via invoice) ----------------

@router.post("/{issue_id}/receiving-invoice", response_model=schemas.InvoiceOut)
def get_or_create_receiving_invoice(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Get-or-create the invoice used to receive an incoming transfer. This is
    what the frontend's 'Receive' button calls -- it then routes to the
    returned invoice's page, and the normal /receive/{invoice_id}/scan-serial
    and /receive/{invoice_id}/add-quantity endpoints do the actual receiving,
    syncing progress back onto this issue as they go."""
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if issue.trade_code != 1:
        raise HTTPException(status_code=400, detail="This issue is not a transfer (trade_code != 1)")

    existing = db.query(models.Invoice).filter(models.Invoice.source_issue_id == issue_id).first()
    if existing:
        row = _invoice_base_query(db).filter(models.Invoice.id == existing.id).first()
        invoice, label, issue_no, src_loc = row
        return _to_invoice_out(invoice, label, issue_no, src_loc)

    if issue.transfer_status == status_codes.TRANSFER_RECEIVED:
        raise HTTPException(status_code=400, detail="This transfer has already been fully received")

    pending_items = [i for i in issue.items if i.received_qty < i.quantity]
    if not pending_items:
        raise HTTPException(status_code=400, detail="Nothing left to receive on this transfer")

    invoice = models.Invoice(
        invoice_no=f"TRF-{issue.issue_no}",
        location_id=issue.to_location_id,
        status=0,  # pending — see config: category='invoice'
        source_issue_id=issue.id,
        created_by=current_user.id,
    )
    db.add(invoice)
    db.flush()  # get invoice.id before adding items

    for line in pending_items:
        db.add(
            models.InvoiceItem(
                invoice_id=invoice.id,
                product_id=line.product_id,
                quantity=line.quantity - line.received_qty,
                unit_price=line.unit_price or line.product.price,
            )
        )

    db.commit()
    db.refresh(invoice)

    row = _invoice_base_query(db).filter(models.Invoice.id == invoice.id).first()
    invoice, label, issue_no, src_loc = row
    return _to_invoice_out(invoice, label, issue_no, src_loc)


# ---------------- Transfer receiving (legacy direct endpoints) ----------------
# NOTE: these operate on the issue directly and bypass invoices entirely.
# The "Receive" button in the UI no longer calls these -- it now creates a
# receiving invoice via /receiving-invoice above and receives through the
# normal invoice receive flow instead. Left in place as an API-only path;
# safe to delete once you're sure nothing else calls them.

def _get_open_transfer(db: Session, issue_id: int) -> models.Issue:
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if issue.trade_code != 1:
        raise HTTPException(status_code=400, detail="This issue is not a transfer (trade_code != 1)")
    if issue.transfer_status == status_codes.TRANSFER_RECEIVED:
        raise HTTPException(status_code=400, detail="This transfer has already been fully received")
    return issue


def _get_transfer_item(db: Session, issue_id: int, product_id, product_unit_id=None) -> models.IssueItem:
    query = db.query(models.IssueItem).filter(
        models.IssueItem.issue_id == issue_id, models.IssueItem.product_id == product_id
    )
    if product_unit_id is not None:
        query = query.filter(models.IssueItem.product_unit_id == product_unit_id)
    item = query.first()
    if not item:
        raise HTTPException(status_code=404, detail="This product is not on this transfer")
    return item


def _refresh_transfer_status(db: Session, issue: models.Issue) -> None:
    """Flip the transfer to 'received' once every line is fully confirmed;
    otherwise it stays 'in_transit' -- mirrors _refresh_invoice_status in receive.py."""
    db.flush()
    items = db.query(models.IssueItem).filter(models.IssueItem.issue_id == issue.id).all()
    if all(i.received_qty >= i.quantity for i in items):
        issue.transfer_status = status_codes.TRANSFER_RECEIVED
    else:
        issue.transfer_status = status_codes.TRANSFER_IN_TRANSIT


def _transfer_status_label(db: Session, transfer_status: int) -> str | None:
    row = (
        db.query(models.Config.value)
        .filter(models.Config.category == "transfer_status", models.Config.key == transfer_status)
        .first()
    )
    return row[0] if row else None


@router.post("/{issue_id}/receive/scan-serial", response_model=schemas.TransferReceiveResultOut)
def receive_transfer_serial(
    issue_id: int,
    payload: schemas.TransferReceiveSerialRequest,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Destination scans a serial to confirm this specific unit has physically arrived."""
    issue = _get_open_transfer(db, issue_id)

    unit = db.query(models.ProductUnit).filter(models.ProductUnit.serial_number == payload.serial_number).first()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Serial '{payload.serial_number}' not found")
    if unit.status != status_codes.PRODUCT_UNIT_IN_TRANSIT:
        raise HTTPException(status_code=400, detail=f"Serial '{payload.serial_number}' is not in transit")

    item = _get_transfer_item(db, issue_id, unit.product_id, product_unit_id=unit.id)
    if item.received_qty >= item.quantity:
        raise HTTPException(status_code=400, detail="This serial has already been received")

    unit.current_location_id = issue.to_location_id
    unit.status = status_codes.PRODUCT_UNIT_IN_STOCK
    item.received_qty = 1

    db.add(
        models.StockTransaction(
            trade_type="RCV",
            trade_code=1,
            product_id=unit.product_id,
            location_id=issue.to_location_id,
            serial_number=unit.serial_number,
            quantity=1,
            ref_type="issue",
            ref_id=issue.id,
            created_by=current_user.id,
        )
    )

    _refresh_transfer_status(db, issue)
    db.commit()

    return schemas.TransferReceiveResultOut(
        issue_id=issue.id,
        transfer_status=issue.transfer_status,
        transfer_status_label=_transfer_status_label(db, issue.transfer_status),
        product_id=unit.product_id,
        item_received_qty=item.received_qty,
        item_quantity=item.quantity,
        message=f"Serial '{payload.serial_number}' received at destination.",
    )


@router.post("/{issue_id}/receive/add-quantity", response_model=schemas.TransferReceiveResultOut)
def receive_transfer_quantity(
    issue_id: int,
    payload: schemas.TransferReceiveQuantityRequest,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Destination confirms a bulk quantity of a non-serialized product has arrived.
    Supports partial receiving across multiple calls, same as invoice receiving."""
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    issue = _get_open_transfer(db, issue_id)
    item = _get_transfer_item(db, issue_id, payload.product_id)

    if item.product_unit_id is not None:
        raise HTTPException(status_code=400, detail="This line is serialized — use receive/scan-serial instead")

    if item.received_qty + payload.quantity > item.quantity:
        remaining = item.quantity - item.received_qty
        raise HTTPException(status_code=400, detail=f"Only {remaining} unit(s) remaining on this line item")

    dest_balance = (
        db.query(models.StockBalance)
        .filter(
            models.StockBalance.product_id == payload.product_id,
            models.StockBalance.location_id == issue.to_location_id,
        )
        .first()
    )
    if not dest_balance:
        dest_balance = models.StockBalance(
            product_id=payload.product_id, location_id=issue.to_location_id, quantity=0
        )
        db.add(dest_balance)
        db.flush()

    dest_balance.quantity += payload.quantity
    item.received_qty += payload.quantity

    db.add(
        models.StockTransaction(
            trade_type="RCV",
            trade_code=1,
            product_id=payload.product_id,
            location_id=issue.to_location_id,
            serial_number=None,
            quantity=payload.quantity,
            ref_type="issue",
            ref_id=issue.id,
            created_by=current_user.id,
        )
    )

    _refresh_transfer_status(db, issue)
    db.commit()

    return schemas.TransferReceiveResultOut(
        issue_id=issue.id,
        transfer_status=issue.transfer_status,
        transfer_status_label=_transfer_status_label(db, issue.transfer_status),
        product_id=payload.product_id,
        item_received_qty=item.received_qty,
        item_quantity=item.quantity,
        message=f"{payload.quantity} unit(s) received at destination.",
    )