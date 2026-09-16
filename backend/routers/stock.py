from fastapi import APIRouter, Depends, Query
from sqlalchemy import text, func, case
from sqlalchemy.orm import Session
from dateutil.relativedelta import relativedelta
from datetime import date
from database import get_db
import schemas, auth, models
import uuid

router = APIRouter(prefix="/stock", tags=["stock"])


@router.get("/current", response_model=list[schemas.CurrentStockOut])
def get_current_stock(
    location_id: int | None = Query(None),
    name: str | None = Query(None, description="Partial match on product name"),
    series: str | None = Query(None, description="Partial match on series"),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Wraps the current_stock view from schema.sql, joined to locations for a display name."""
    sql = """
        SELECT
            cs.product_id, cs.sku, cs.name, cs.series, cs.storage_size, cs.color,
            cs.is_serialized, cs.location_id, l.name AS location_name, cs.quantity
        FROM current_stock cs
        JOIN locations l ON l.id = cs.location_id
        WHERE (:location_id IS NULL OR cs.location_id = :location_id)
          AND (:name IS NULL OR cs.name ILIKE '%' || :name || '%')
          AND (:series IS NULL OR cs.series ILIKE '%' || :series || '%')
        ORDER BY l.name, cs.name
    """
    rows = db.execute(
        text(sql),
        {"location_id": location_id, "name": name, "series": series},
    ).mappings().all()
    return [schemas.CurrentStockOut(**row) for row in rows]


@router.get("/tracking", response_model=list[schemas.StockTrackingOut])
def get_stock_tracking(
    location_id: int | None = Query(None),
    product_name: str | None = Query(None, description="Partial match on product name"),
    status: str | None = Query(None, description="in_stock, issued, wasted"),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Wraps the stock_tracking view from schema.sql. location_id is resolved via a join
    against locations since the view itself only carries the location name."""
    sql = """
        SELECT st.*
        FROM stock_tracking st
        LEFT JOIN locations l ON l.name = st.location_name
        WHERE (:location_id IS NULL OR l.id = :location_id)
          AND (:product_name IS NULL OR st.product_name ILIKE '%' || :product_name || '%')
          AND (:status IS NULL OR st.status = :status)
        ORDER BY st.location_name, st.product_name
    """
    rows = db.execute(
        text(sql),
        {"location_id": location_id, "product_name": product_name, "status": status},
    ).mappings().all()
    return [schemas.StockTrackingOut(**row) for row in rows]


@router.get("/transactions", response_model=list[schemas.StockTransactionOut])
def get_stock_transactions(
    location_id: int | None = Query(None),
    product_name: str | None = Query(None, description="Partial match on product name"),
    trade_type: str | None = Query(None, description="RCV (receive) or ISS (issue)"),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Chronological log of every receive/issue movement, newest first.

    Reads directly from stock_transactions (not a view), joined to products and
    locations for display names. This is the authoritative "what happened, when"
    record -- unlike stock_tracking, which only reflects current state.
    """
    sql = """
        SELECT
            t.id, t.trade_type, t.trade_code, t.product_id, p.name AS product_name,
            t.location_id, l.name AS location_name, t.serial_number, t.quantity,
            t.ref_type, t.ref_id, t.ref_doc_number, t.direction,
            t.created_by, t.created_at
        FROM stock_transactions t
        JOIN products p ON p.id = t.product_id
        JOIN locations l ON l.id = t.location_id
        WHERE (:location_id IS NULL OR t.location_id = :location_id)
          AND (:product_name IS NULL OR p.name ILIKE '%' || :product_name || '%')
          AND (:trade_type IS NULL OR t.trade_type = :trade_type)
        ORDER BY t.created_at DESC, t.id DESC
    """
    rows = db.execute(
        text(sql),
        {"location_id": location_id, "product_name": product_name, "trade_type": trade_type},
    ).mappings().all()
    return [schemas.StockTransactionOut(**row) for row in rows]


@router.get("/dashboard/monthly-trend", response_model=list[schemas.MonthlyStockTrendOut])
def get_monthly_trend(
    months: int = 6,
    location_ids: str | None = None,
    product_ids: str | None = None,
    db: Session = Depends(get_db),
):
    cutoff = date.today().replace(day=1) - relativedelta(months=months - 1)

    query = db.query(
        models.StockMonthlySummary.month,
        func.sum(models.StockMonthlySummary.received_qty).label("received"),
        func.sum(models.StockMonthlySummary.issued_qty).label("issued"),
    ).filter(models.StockMonthlySummary.month >= cutoff)

    if location_ids:
        loc_list = [int(x) for x in location_ids.split(",") if x]
        query = query.filter(models.StockMonthlySummary.location_id.in_(loc_list))

    if product_ids:
        prod_list = [uuid.UUID(x) for x in product_ids.split(",") if x]
        query = query.filter(models.StockMonthlySummary.product_id.in_(prod_list))

    rows = (
        query.group_by(models.StockMonthlySummary.month)
             .order_by(models.StockMonthlySummary.month)
             .all()
    )
    return [
        schemas.MonthlyStockTrendOut(month=r.month.strftime("%Y-%m"), received=r.received, issued=r.issued)
        for r in rows
    ]


@router.get("/monthly-summary", response_model=list[schemas.StockMonthlySummaryOut])
def get_monthly_summary(
    month_from: date | None = Query(None, description="Inclusive, e.g. 2026-01-01"),
    month_to: date | None = Query(None, description="Inclusive, e.g. 2026-09-01"),
    location_ids: str | None = Query(None, description="Comma-separated location ids"),
    product_ids: str | None = Query(None, description="Comma-separated product UUIDs"),
    sku: str | None = Query(None, description="Partial match on SKU"),
    product_name: str | None = Query(None, description="Partial match on product name"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Denormalized monthly rollup, one row per (month, product, location)."""
    query = db.query(models.StockMonthlySummary)

    if month_from:
        query = query.filter(models.StockMonthlySummary.month >= month_from)
    if month_to:
        query = query.filter(models.StockMonthlySummary.month <= month_to)

    if location_ids:
        loc_list = [int(x) for x in location_ids.split(",") if x]
        query = query.filter(models.StockMonthlySummary.location_id.in_(loc_list))

    if product_ids:
        prod_list = [uuid.UUID(x) for x in product_ids.split(",") if x]
        query = query.filter(models.StockMonthlySummary.product_id.in_(prod_list))

    if sku:
        query = query.filter(models.StockMonthlySummary.sku.ilike(f"%{sku}%"))
    if product_name:
        query = query.filter(models.StockMonthlySummary.product_name.ilike(f"%{product_name}%"))

    rows = (
        query.order_by(
            models.StockMonthlySummary.month.desc(),
            models.StockMonthlySummary.location_name,
            models.StockMonthlySummary.product_name,
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [schemas.StockMonthlySummaryOut.model_validate(r) for r in rows]