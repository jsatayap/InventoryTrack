from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
import schemas, auth, models

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ---------------- Thresholds (CRUD) ----------------

@router.get("/thresholds", response_model=list[schemas.StockThresholdOut])
def list_thresholds(
    location_id: int | None = Query(None),
    product_name: str | None = Query(None, description="Partial match on product name"),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    sql = """
        SELECT
            st.id, st.product_id, p.sku, p.name AS product_name,
            st.location_id, l.name AS location_name,
            st.reorder_point, st.created_at, st.updated_at
        FROM stock_thresholds st
        JOIN products p ON p.id = st.product_id
        JOIN locations l ON l.id = st.location_id
        WHERE (:location_id IS NULL OR st.location_id = :location_id)
          AND (:product_name IS NULL OR p.name ILIKE '%' || :product_name || '%')
        ORDER BY l.name, p.name
    """
    rows = db.execute(
        text(sql),
        {"location_id": location_id, "product_name": product_name},
    ).mappings().all()
    return [schemas.StockThresholdOut(**row) for row in rows]


@router.post("/thresholds", response_model=schemas.StockThresholdOut)
def upsert_threshold(
    payload: schemas.StockThresholdCreate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Create a threshold, or update reorder_point in place if one already exists
    for this (product_id, location_id) -- keeps the one-threshold-per-grain
    invariant without making the frontend check first."""
    existing = (
        db.query(models.StockThreshold)
        .filter(
            models.StockThreshold.product_id == payload.product_id,
            models.StockThreshold.location_id == payload.location_id,
        )
        .first()
    )
    if existing:
        existing.reorder_point = payload.reorder_point
        existing.updated_by = current_user.id
        db.commit()
        db.refresh(existing)
        threshold = existing
    else:
        threshold = models.StockThreshold(
            product_id=payload.product_id,
            location_id=payload.location_id,
            reorder_point=payload.reorder_point,
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        db.add(threshold)
        db.commit()
        db.refresh(threshold)

    row = db.execute(
        text("""
            SELECT st.id, st.product_id, p.sku, p.name AS product_name,
                   st.location_id, l.name AS location_name,
                   st.reorder_point, st.created_at, st.updated_at
            FROM stock_thresholds st
            JOIN products p ON p.id = st.product_id
            JOIN locations l ON l.id = st.location_id
            WHERE st.id = :id
        """),
        {"id": threshold.id},
    ).mappings().first()
    return schemas.StockThresholdOut(**row)


@router.patch("/thresholds/{threshold_id}", response_model=schemas.StockThresholdOut)
def update_threshold(
    threshold_id: int,
    payload: schemas.StockThresholdUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    threshold = db.query(models.StockThreshold).filter(models.StockThreshold.id == threshold_id).first()
    if not threshold:
        raise HTTPException(status_code=404, detail="Threshold not found")

    threshold.reorder_point = payload.reorder_point
    threshold.updated_by = current_user.id
    db.commit()

    row = db.execute(
        text("""
            SELECT st.id, st.product_id, p.sku, p.name AS product_name,
                   st.location_id, l.name AS location_name,
                   st.reorder_point, st.created_at, st.updated_at
            FROM stock_thresholds st
            JOIN products p ON p.id = st.product_id
            JOIN locations l ON l.id = st.location_id
            WHERE st.id = :id
        """),
        {"id": threshold_id},
    ).mappings().first()
    return schemas.StockThresholdOut(**row)


@router.delete("/thresholds/{threshold_id}", status_code=204)
def delete_threshold(
    threshold_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    threshold = db.query(models.StockThreshold).filter(models.StockThreshold.id == threshold_id).first()
    if not threshold:
        raise HTTPException(status_code=404, detail="Threshold not found")
    db.delete(threshold)
    db.commit()


# ---------------- Low-stock alert list ----------------

@router.get("/low-stock", response_model=list[schemas.LowStockAlertOut])
def get_low_stock_alerts(
    location_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Every (product, location) whose current quantity is at or below its
    configured reorder point.

    Starts from stock_thresholds (not current_stock) and LEFT JOINs stock onto
    it, coalescing to 0. A product that has a threshold set but has never had
    any stock received at that location has no row in current_stock at all --
    starting from current_stock would silently miss that "quantity is
    definitely 0" case. A row only appears here if a reorder_point has been
    configured; no threshold means no alert.

    incoming_qty is the unreceived remainder of any open invoice line (status
    0/pending or 1/receiving; see config category='invoice') for that product
    at that location -- i.e. stock already on order but not yet scanned in.
    alert_category is 'critical' when on-hand + incoming still won't clear the
    reorder point, or 'on_order' when incoming stock is enough to clear it --
    so a manager can tell "needs a new PO" apart from "already ordered, just
    waiting on delivery" at a glance.
    """
    sql = """
        WITH incoming AS (
            SELECT ii.product_id, i.location_id,
                   SUM(ii.quantity - ii.received_qty) AS incoming_qty
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            WHERE i.status IN (0, 1)
              AND ii.received_qty < ii.quantity
            GROUP BY ii.product_id, i.location_id
        )
        SELECT
            st.product_id, p.sku, p.name, p.series, p.is_serialized,
            st.location_id, l.name AS location_name,
            COALESCE(cs.quantity, 0) AS quantity,
            st.reorder_point,
            (st.reorder_point - COALESCE(cs.quantity, 0)) AS shortage,
            COALESCE(inc.incoming_qty, 0) AS incoming_qty,
            (COALESCE(cs.quantity, 0) + COALESCE(inc.incoming_qty, 0)) AS effective_stock,
            CASE
                WHEN (COALESCE(cs.quantity, 0) + COALESCE(inc.incoming_qty, 0)) <= st.reorder_point
                THEN 'critical'
                ELSE 'on_order'
            END AS alert_category
        FROM stock_thresholds st
        JOIN products p ON p.id = st.product_id
        JOIN locations l ON l.id = st.location_id
        LEFT JOIN current_stock cs
            ON cs.product_id = st.product_id AND cs.location_id = st.location_id
        LEFT JOIN incoming inc
            ON inc.product_id = st.product_id AND inc.location_id = st.location_id
        WHERE COALESCE(cs.quantity, 0) <= st.reorder_point
          AND (:location_id IS NULL OR st.location_id = :location_id)
        ORDER BY shortage DESC, l.name, p.name
    """
    rows = db.execute(text(sql), {"location_id": location_id}).mappings().all()
    return [schemas.LowStockAlertOut(**row) for row in rows]