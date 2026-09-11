import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/products", tags=["products"])


# ---------------- Search / List ----------------

@router.get("", response_model=list[schemas.ProductStockOut])
def search_products(
    location_id: int | None = Query(None, description="Only show products currently in stock at this location"),
    name: str | None = Query(None, description="Partial match on product name"),
    series: str | None = Query(None, description="Partial match on series, e.g. 'iPhone 15'"),
    storage_size: int | None = Query(None, description="Exact match, in GB, e.g. 256"),
    min_storage: int | None = Query(None, description="Minimum storage, in GB"),
    max_storage: int | None = Query(None, description="Maximum storage, in GB"),
    color: str | None = Query(None, description="Partial match on color"),
    ram: int | None = Query(None, description="Exact match, in GB, e.g. 8"),
    min_ram: int | None = Query(None, description="Minimum RAM, in GB"),
    max_ram: int | None = Query(None, description="Maximum RAM, in GB"),
    min_price: float | None = Query(None),
    max_price: float | None = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    query = db.query(models.Product)

    if not include_inactive:
        query = query.filter(models.Product.is_active.is_(True))
    if name:
        query = query.filter(models.Product.name.ilike(f"%{name}%"))
    if series:
        query = query.filter(models.Product.series.ilike(f"%{series}%"))
    if storage_size is not None:
        query = query.filter(models.Product.storage_size == storage_size)
    if min_storage is not None:
        query = query.filter(models.Product.storage_size >= min_storage)
    if max_storage is not None:
        query = query.filter(models.Product.storage_size <= max_storage)
    if color:
        query = query.filter(models.Product.color.ilike(f"%{color}%"))
    if ram is not None:
        query = query.filter(models.Product.ram == ram)
    if min_ram is not None:
        query = query.filter(models.Product.ram >= min_ram)
    if max_ram is not None:
        query = query.filter(models.Product.ram <= max_ram)
    if min_price is not None:
        query = query.filter(models.Product.price >= min_price)
    if max_price is not None:
        query = query.filter(models.Product.price <= max_price)

    products = query.order_by(models.Product.name).all()

    if not location_id:
        # No location filter -> just return products, quantity omitted
        return [
            schemas.ProductStockOut(**schemas.ProductOut.model_validate(p).model_dump())
            for p in products
        ]

    # Location filter -> only return products that actually have stock there,
    # pulling quantity from the current_stock view defined in schema.sql
    product_ids = [p.id for p in products]
    if not product_ids:
        return []

    rows = db.execute(
        text(
            "SELECT product_id, quantity FROM current_stock "
            "WHERE location_id = :loc AND product_id = ANY(:ids)"
        ),
        {"loc": location_id, "ids": product_ids},
    ).fetchall()
    qty_by_product = {row.product_id: row.quantity for row in rows}

    location = db.query(models.Location).filter(models.Location.id == location_id).first()
    location_name = location.name if location else None

    results = []
    for p in products:
        if p.id in qty_by_product:
            results.append(
                schemas.ProductStockOut(
                    **schemas.ProductOut.model_validate(p).model_dump(),
                    location_id=location_id,
                    location_name=location_name,
                    quantity=qty_by_product[p.id],
                )
            )
    return results


# ---------------- CRUD ----------------

@router.get("/{product_id}", response_model=schemas.ProductOut)
def get_product(product_id: uuid.UUID, db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("", response_model=schemas.ProductOut, status_code=201)
def create_product(
    payload: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    existing = db.query(models.Product).filter(models.Product.sku == payload.sku).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"SKU '{payload.sku}' already exists")

    product = models.Product(**payload.model_dump(), created_by=current_user.id)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=schemas.ProductOut)
def update_product(
    product_id: uuid.UUID,
    payload: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(product, field, value)
    product.updated_by = current_user.id
    product.updated_at = func.now()

    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
def deactivate_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Soft delete: products are referenced by invoices/units, so we never hard-delete."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.is_active = False
    product.updated_by = current_user.id
    product.updated_at = func.now()
    db.commit()
    return None