from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from dateutil.relativedelta import relativedelta
from datetime import date
from database import get_db
import schemas, auth
import routers.new_stock_summary_service as svc
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


def _parse_int_list(value: str | None) -> list[int] | None:
    try:
        return [int(x) for x in value.split(",") if x] if value else None
    except ValueError:
        raise HTTPException(422, "location_ids must be comma-separated integers")


def _parse_uuid_list(value: str | None) -> list[uuid.UUID] | None:
    try:
        return [uuid.UUID(x) for x in value.split(",") if x] if value else None
    except ValueError:
        raise HTTPException(422, "product_ids must be comma-separated UUIDs")


def _require_admin(current_user=Depends(auth.get_current_user)):
    if getattr(current_user, "role", None) != "admin":   # TODO: your admin role name
        raise HTTPException(403, "Admin only")
    return current_user


def _pg_code(e: DBAPIError):
    return getattr(e.orig, "pgcode", None) or getattr(e.orig, "sqlstate", None)


def _pg_message(e: DBAPIError) -> str:
    diag = getattr(e.orig, "diag", None)
    return getattr(diag, "message_primary", None) or str(e.orig).splitlines()[0]


@router.get("/dashboard/monthly-trend", response_model=list[schemas.MonthlyStockTrendOut])
def get_monthly_trend(
    months: int = 6,
    location_ids: str | None = None,
    product_ids: str | None = None,
    db: Session = Depends(get_db),
):
    """Received/issued per month. Closed months come from the stored summary;
    the current (open) month is read live from stock_transactions."""
    cutoff = svc.current_month(db) - relativedelta(months=months - 1)
    rows = svc.get_monthly_trend(
        db, cutoff, _parse_int_list(location_ids), _parse_uuid_list(product_ids)
    )
    return [
        schemas.MonthlyStockTrendOut(
            month=r["month"].strftime("%Y-%m"), received=r["received"], issued=r["issued"]
        )
        for r in rows
    ]


@router.get("/monthly-summary", response_model=schemas.MonthlySummaryListOut)
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
    combine_locations: bool = Query(False, description="Sum the selected locations into one row per month+product"),
):
    """One row per (month, product, location), with per-trade-code quantities.

    Closed months are the stored, immutable snapshot; months not closed yet
    (normally the current one) are computed live. Each row has `is_closed`.
    `columns` gives the trade-code column order for the `quantities` keys.
    With no month filter, only the current month is returned.
    """
    month_to = month_to or svc.current_month(db)
    month_from = month_from or month_to
    return svc.get_summary_range(
        db, month_from, month_to,
        _parse_int_list(location_ids), _parse_uuid_list(product_ids),
        sku, product_name, skip, limit,
        combine=combine_locations,
    )


@router.get("/trade-codes", response_model=list[schemas.TradeCodeOut])
def list_trade_codes(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    return svc.get_trade_codes(db)


@router.post("/trade-codes", response_model=schemas.TradeCodeOut, status_code=201)
def create_trade_code(
    body: schemas.TradeCodeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(_require_admin),
):
    """Registers a trade code and adds its column to stock_monthly_summary."""
    try:
        svc.add_trade_code(db, body.trade_type, body.code, body.description)
    except DBAPIError as e:
        db.rollback()
        pg = _pg_code(e)
        if pg == "23505":
            raise HTTPException(409, f"Trade code {body.trade_type}/{body.code} already exists")
        if pg == "23514":
            raise HTTPException(422, "Invalid trade type or code")
        raise
    return next(c for c in svc.get_trade_codes(db)
                if c["trade_type"] == body.trade_type and c["code"] == body.code)


@router.get("/periods", response_model=schemas.PeriodStatusOut)
def get_period_status(db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    """Closed months, the next month that can be closed, and whether it may be closed now."""
    return svc.get_period_status(db)


@router.post("/monthly-summary/close", response_model=schemas.CloseMonthResult)
def close_month(
    body: schemas.CloseMonthRequest,
    db: Session = Depends(get_db),
    current_user=Depends(_require_admin),
):
    """ONE-WAY: after this the month's summary rows can never be changed."""
    month = svc.first_of_month(body.month)
    try:
        rows = svc.close_month(db, month)
    except DBAPIError as e:
        db.rollback()
        if _pg_code(e) == "P0001":          # RAISE EXCEPTION inside fn_close_month
            raise HTTPException(400, _pg_message(e))
        raise
    return {"month": month, "rows_written": rows}