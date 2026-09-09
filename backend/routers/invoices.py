from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _to_invoice_out(invoice: models.Invoice) -> schemas.InvoiceOut:
    return schemas.InvoiceOut(
        id=invoice.id,
        invoice_no=invoice.invoice_no,
        location_id=invoice.location_id,
        location_name=invoice.location.name if invoice.location else None,
        status=invoice.status,
        invoice_date=str(invoice.invoice_date),
        created_by=invoice.created_by,
        items=[
            schemas.InvoiceItemOut(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else None,
                quantity=item.quantity,
                unit_price=float(item.unit_price),
                received_qty=item.received_qty,
            )
            for item in invoice.items
        ],
    )


@router.get("", response_model=list[schemas.InvoiceOut])
def list_invoices(
    location_id: int | None = Query(None),
    status: str | None = Query(None, description="pending, receiving, completed, cancelled"),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    query = db.query(models.Invoice).options(
        joinedload(models.Invoice.items).joinedload(models.InvoiceItem.product),
        joinedload(models.Invoice.location),
    )
    if location_id:
        query = query.filter(models.Invoice.location_id == location_id)
    if status:
        query = query.filter(models.Invoice.status == status)

    invoices = query.order_by(models.Invoice.created_at.desc()).all()
    return [_to_invoice_out(inv) for inv in invoices]


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    invoice = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.items).joinedload(models.InvoiceItem.product),
            joinedload(models.Invoice.location),
        )
        .filter(models.Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _to_invoice_out(invoice)


@router.post("", response_model=schemas.InvoiceOut, status_code=201)
def create_invoice(
    payload: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    existing = db.query(models.Invoice).filter(models.Invoice.invoice_no == payload.invoice_no).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Invoice number '{payload.invoice_no}' already exists")

    location = db.query(models.Location).filter(models.Location.id == payload.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    if not payload.items:
        raise HTTPException(status_code=400, detail="Invoice must have at least one item")

    for item in payload.items:
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product id {item.product_id} not found")

    invoice = models.Invoice(
        invoice_no=payload.invoice_no,
        location_id=payload.location_id,
        status="pending",
        created_by=current_user.id,
    )
    if payload.invoice_date:
        invoice.invoice_date = payload.invoice_date

    db.add(invoice)
    db.flush()  # get invoice.id before adding items

    for item in payload.items:
        db.add(
            models.InvoiceItem(
                invoice_id=invoice.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
            )
        )

    db.commit()
    db.refresh(invoice)

    # reload with relationships for the response
    invoice = (
        db.query(models.Invoice)
        .options(
            joinedload(models.Invoice.items).joinedload(models.InvoiceItem.product),
            joinedload(models.Invoice.location),
        )
        .filter(models.Invoice.id == invoice.id)
        .first()
    )
    return _to_invoice_out(invoice)