import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas, auth, status_codes
from config_utils import get_config_labels

router = APIRouter(prefix="/receive", tags=["receive"])


def _get_open_invoice(db: Session, invoice_id: int) -> models.Invoice:
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status in (2, 3):  # completed, cancelled
        labels = get_config_labels(db, "invoice")
        raise HTTPException(
            status_code=400,
            detail=f"Invoice is already {labels.get(invoice.status, invoice.status)}, cannot receive against it",
        )
    return invoice


def _get_invoice_item(db: Session, invoice_id: int, product_id: uuid.UUID) -> models.InvoiceItem:
    item = (
        db.query(models.InvoiceItem)
        .filter(models.InvoiceItem.invoice_id == invoice_id, models.InvoiceItem.product_id == product_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="This product is not on this invoice")
    return item


def _refresh_invoice_status(db: Session, invoice: models.Invoice) -> None:
    """Flip invoice to 'receiving' once something's scanned, 'completed' once everything is."""
    db.flush()
    items = db.query(models.InvoiceItem).filter(models.InvoiceItem.invoice_id == invoice.id).all()
    all_done = all(i.received_qty >= i.quantity for i in items)
    any_done = any(i.received_qty > 0 for i in items)

    if all_done:
        invoice.status = 2  # completed
    elif any_done:
        invoice.status = 1  # receiving
    # else stays 0 (pending)


def _find_transfer_item(
    db: Session, invoice: models.Invoice, product_id: uuid.UUID, product_unit_id: int | None = None
) -> models.IssueItem | None:
    """If this invoice exists to receive an incoming transfer (source_issue_id set),
    find the matching line on the source issue so we can keep transfer progress
    in sync as this invoice gets received against."""
    if invoice.source_issue_id is None:
        return None
    query = db.query(models.IssueItem).filter(
        models.IssueItem.issue_id == invoice.source_issue_id,
        models.IssueItem.product_id == product_id,
    )
    if product_unit_id is not None:
        query = query.filter(models.IssueItem.product_unit_id == product_unit_id)
    return query.first()


def _sync_transfer_progress(
    db: Session, invoice: models.Invoice, transfer_item: models.IssueItem | None, qty_delta: int
) -> None:
    """Push received quantity back onto the source issue's line, and flip the
    issue's transfer_status once every line is fully received -- mirrors
    _refresh_transfer_status in issues.py, but driven from the invoice side."""
    if transfer_item is None:
        return
    transfer_item.received_qty += qty_delta
    db.flush()
    issue = db.query(models.Issue).filter(models.Issue.id == invoice.source_issue_id).first()
    items = db.query(models.IssueItem).filter(models.IssueItem.issue_id == issue.id).all()
    if all(i.received_qty >= i.quantity for i in items):
        issue.transfer_status = status_codes.TRANSFER_RECEIVED
    else:
        issue.transfer_status = status_codes.TRANSFER_IN_TRANSIT


@router.post("/{invoice_id}/scan-serial", response_model=schemas.ReceiveResultOut)
def receive_by_serial(
    invoice_id: int,
    payload: schemas.ReceiveSerialRequest,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """For serialized products: scan one physical unit's serial/IMEI at a time.

    For a normal purchase invoice, the serial must not already exist. For an
    invoice created to receive an incoming transfer (invoice.source_issue_id
    is set), the serial *is* expected to already exist -- it was created when
    the unit was originally received at the origin store -- so as long as it's
    currently in-transit as part of this exact transfer, we re-home it instead
    of rejecting it."""
    invoice = _get_open_invoice(db, invoice_id)
    item = _get_invoice_item(db, invoice_id, payload.product_id)

    product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.is_serialized:
        raise HTTPException(status_code=400, detail="This product is non-serialized — use /receive/{invoice_id}/add-quantity instead")

    if item.received_qty >= item.quantity:
        raise HTTPException(status_code=400, detail="This line item is already fully received")

    existing_unit = db.query(models.ProductUnit).filter(models.ProductUnit.serial_number == payload.serial_number).first()
    transfer_item = None
    if existing_unit:
        transfer_item = _find_transfer_item(db, invoice, payload.product_id, product_unit_id=existing_unit.id)
        reusable = (
            invoice.source_issue_id is not None
            and transfer_item is not None
            and existing_unit.status == status_codes.PRODUCT_UNIT_IN_TRANSIT
            and existing_unit.product_id == payload.product_id
        )
        if not reusable:
            if invoice.source_issue_id is None:
                detail = (
                    f"Serial '{payload.serial_number}' is already recorded in the system "
                    f"(this invoice isn't linked to a transfer — was it created via the "
                    f"'Receive' button on the incoming transfer?)"
                )
            elif existing_unit.product_id != payload.product_id:
                detail = (
                    f"Serial '{payload.serial_number}' belongs to a different product "
                    f"than the one selected"
                )
            elif transfer_item is None:
                detail = (
                    f"Serial '{payload.serial_number}' exists but isn't part of "
                    f"transfer #{invoice.source_issue_id} — check you're receiving against "
                    f"the right invoice"
                )
            else:
                detail = (
                    f"Serial '{payload.serial_number}' is not currently in transit "
                    f"(status={existing_unit.status}) — it may already have been received"
                )
            raise HTTPException(status_code=409, detail=detail)

        existing_unit.current_location_id = invoice.location_id
        existing_unit.status = status_codes.PRODUCT_UNIT_IN_STOCK
        existing_unit.invoice_item_id = item.id
        unit = existing_unit
    else:
        unit = models.ProductUnit(
            product_id=payload.product_id,
            serial_number=payload.serial_number,
            status=status_codes.PRODUCT_UNIT_IN_STOCK,
            current_location_id=invoice.location_id,
            invoice_item_id=item.id,
        )
        db.add(unit)

    item.received_qty += 1

    db.add(
        models.StockTransaction(
            trade_type="RCV",
            trade_code=1 if invoice.source_issue_id else 0,  # 1 = transfer, 0 = purchase / invoice
            product_id=payload.product_id,
            location_id=invoice.location_id,
            serial_number=payload.serial_number,
            quantity=1,
            ref_type="invoice",
            ref_id=invoice.id,
            created_by=current_user.id,
        )
    )

    _sync_transfer_progress(db, invoice, transfer_item, 1)
    _refresh_invoice_status(db, invoice)
    db.commit()

    return schemas.ReceiveResultOut(
        invoice_id=invoice.id,
        invoice_status=invoice.status,
        product_id=payload.product_id,
        item_received_qty=item.received_qty,
        item_quantity=item.quantity,
        message=f"Serial '{payload.serial_number}' received.",
    )


@router.post("/{invoice_id}/add-quantity", response_model=schemas.ReceiveResultOut)
def receive_by_quantity(
    invoice_id: int,
    payload: schemas.ReceiveQuantityRequest,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """For non-serialized products: add a bulk quantity instead of scanning individual units.
    Works the same whether the invoice is a normal purchase or a transfer-receiving
    invoice; when it's the latter, progress is also synced back onto the source issue."""
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    invoice = _get_open_invoice(db, invoice_id)
    item = _get_invoice_item(db, invoice_id, payload.product_id)

    product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.is_serialized:
        raise HTTPException(status_code=400, detail="This product is serialized — use /receive/{invoice_id}/scan-serial instead")

    if item.received_qty + payload.quantity > item.quantity:
        remaining = item.quantity - item.received_qty
        raise HTTPException(status_code=400, detail=f"Only {remaining} unit(s) remaining on this line item")

    transfer_item = _find_transfer_item(db, invoice, payload.product_id)

    balance = (
        db.query(models.StockBalance)
        .filter(models.StockBalance.product_id == payload.product_id, models.StockBalance.location_id == invoice.location_id)
        .first()
    )
    if not balance:
        balance = models.StockBalance(product_id=payload.product_id, location_id=invoice.location_id, quantity=0)
        db.add(balance)
        db.flush()

    balance.quantity += payload.quantity
    item.received_qty += payload.quantity

    db.add(
        models.StockTransaction(
            trade_type="RCV",
            trade_code=1 if invoice.source_issue_id else 0,  # 1 = transfer, 0 = purchase / invoice
            product_id=payload.product_id,
            location_id=invoice.location_id,
            serial_number=None,
            quantity=payload.quantity,
            ref_type="invoice",
            ref_id=invoice.id,
            created_by=current_user.id,
        )
    )

    _sync_transfer_progress(db, invoice, transfer_item, payload.quantity)
    _refresh_invoice_status(db, invoice)
    db.commit()

    return schemas.ReceiveResultOut(
        invoice_id=invoice.id,
        invoice_status=invoice.status,
        product_id=payload.product_id,
        item_received_qty=item.received_qty,
        item_quantity=item.quantity,
        message=f"{payload.quantity} unit(s) received.",
    )