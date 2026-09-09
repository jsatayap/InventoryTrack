from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/issues", tags=["issues"])

VALID_ISS_TRADE_CODES = {"01", "55", "99"}  # transfer, adjust, wasted

# maps a trade code to the resulting status on the physical unit
UNIT_STATUS_BY_TRADE_CODE = {
    "01": "transferred",
    "55": "issued",
    "99": "wasted",
}


def _to_issue_out(issue: models.Issue) -> schemas.IssueOut:
    return schemas.IssueOut(
        id=issue.id,
        issue_no=issue.issue_no,
        location_id=issue.location_id,
        location_name=issue.location.name if issue.location else None,
        reason_type=issue.reason_type,
        trade_code=issue.trade_code,
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
            )
            for item in issue.items
        ],
    )


@router.get("", response_model=list[schemas.IssueOut])
def list_issues(
    location_id: int | None = Query(None),
    trade_code: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    query = db.query(models.Issue).options(
        joinedload(models.Issue.items).joinedload(models.IssueItem.product),
        joinedload(models.Issue.items).joinedload(models.IssueItem.product_unit),
        joinedload(models.Issue.location),
    )
    if location_id:
        query = query.filter(models.Issue.location_id == location_id)
    if trade_code:
        query = query.filter(models.Issue.trade_code == trade_code)

    issues = query.order_by(models.Issue.created_at.desc()).all()
    return [_to_issue_out(i) for i in issues]


@router.get("/{issue_id}", response_model=schemas.IssueOut)
def get_issue(issue_id: int, db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    issue = (
        db.query(models.Issue)
        .options(
            joinedload(models.Issue.items).joinedload(models.IssueItem.product),
            joinedload(models.Issue.items).joinedload(models.IssueItem.product_unit),
            joinedload(models.Issue.location),
        )
        .filter(models.Issue.id == issue_id)
        .first()
    )
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return _to_issue_out(issue)


@router.post("", response_model=schemas.IssueOut, status_code=201)
def create_issue(
    payload: schemas.IssueCreate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    if payload.trade_code not in VALID_ISS_TRADE_CODES:
        raise HTTPException(status_code=400, detail=f"trade_code must be one of {sorted(VALID_ISS_TRADE_CODES)}")
    if payload.reason_type not in ("trade_code", "trade_description"):
        raise HTTPException(status_code=400, detail="reason_type must be 'trade_code' or 'trade_description'")

    existing = db.query(models.Issue).filter(models.Issue.issue_no == payload.issue_no).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Issue number '{payload.issue_no}' already exists")

    location = db.query(models.Location).filter(models.Location.id == payload.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    if not payload.items:
        raise HTTPException(status_code=400, detail="Issue must have at least one item")

    # ---- Pass 1: validate every line before touching any data ----
    resolved = []  # (product, unit_or_none, quantity)
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
                    models.ProductUnit.status == "in_stock",
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
        reason_type=payload.reason_type,
        trade_code=payload.trade_code,
        remark=payload.remark,
        created_by=current_user.id,
    )
    db.add(issue)
    db.flush()  # get issue.id

    new_status = UNIT_STATUS_BY_TRADE_CODE[payload.trade_code]

    for product, unit_or_balance, qty in resolved:
        if product.is_serialized:
            unit = unit_or_balance
            unit.status = new_status
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

    db.commit()

    issue = (
        db.query(models.Issue)
        .options(
            joinedload(models.Issue.items).joinedload(models.IssueItem.product),
            joinedload(models.Issue.items).joinedload(models.IssueItem.product_unit),
            joinedload(models.Issue.location),
        )
        .filter(models.Issue.id == issue.id)
        .first()
    )
    return _to_issue_out(issue)