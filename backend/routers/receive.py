from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/receive", tags=["receive"])


def _get_open_invoice(db: Session, invoice_id: int) -> models.Invoice:
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Invoice is already {invoice.status}, cannot receive against it")
    return invoice


def _get_invoice_item(db: Session, invoice_id: int, product_id: int) -> models.InvoiceItem:
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
        invoice.status = "completed"
    elif any_done:
        invoice.status = "receiving"
    # else stays 'pending'


@router.post("/{invoice_id}/scan-serial", response_model=schemas.ReceiveResultOut)
def receive_by_serial(
    invoice_id: int,
    payload: schemas.ReceiveSerialRequest,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """For serialized products: scan one physical unit's serial/IMEI at a time."""
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
    if existing_unit:
        raise HTTPException(status_code=409, detail=f"Serial '{payload.serial_number}' is already recorded in the system")

    unit = models.ProductUnit(
        product_id=payload.product_id,
        serial_number=payload.serial_number,
        status="in_stock",
        current_location_id=invoice.location_id,
        invoice_item_id=item.id,
    )
    db.add(unit)

    item.received_qty += 1

    db.add(
        models.StockTransaction(
            trade_type="RCV",
            trade_code="00",  # purchase / invoice
            product_id=payload.product_id,
            location_id=invoice.location_id,
            serial_number=payload.serial_number,
            quantity=1,
            ref_type="invoice",
            ref_id=invoice.id,
            created_by=current_user.id,
        )
    )

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
    """For non-serialized products: add a bulk quantity instead of scanning individual units."""
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
            trade_code="00",
            product_id=payload.product_id,
            location_id=invoice.location_id,
            serial_number=None,
            quantity=payload.quantity,
            ref_type="invoice",
            ref_id=invoice.id,
            created_by=current_user.id,
        )
    )

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