"""
Quarterly stock summary — on-demand rollup of stock_monthly_summary.

Register in main.py:
    from reports_quarterly_summary import router as quarterly_summary_router
    app.include_router(quarterly_summary_router)
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text, func
from sqlalchemy.orm import Session

from database import get_db
from models import StockQuarterlySummary
from schemas import StockQuarterlySummaryOut

router = APIRouter(prefix="/reports/quarterly-summary", tags=["reports"])

# All four filters are optional. Each is expressed as
# "(:param IS NULL OR <condition>)" so the same parameterized query works
# whether the caller wants everything or one specific year/quarter/location/product.
REFRESH_SQL = text("""
    INSERT INTO stock_quarterly_summary (
        quarter, product_id, location_id,
        sku, product_name, series, is_serialized, location_code, location_name,
        received_qty, opening_balance,
        issued_transfer_qty, issued_adjustment_qty, issued_wasted_qty, total_issued_qty,
        net_change_qty, closing_balance,
        avg_unit_price, received_value, issued_value,
        invoice_count, transaction_count
    )
    SELECT
        date_trunc('quarter', month)::date AS quarter,
        product_id,
        location_id,
        MAX(sku), MAX(product_name), MAX(series), bool_and(is_serialized),
        MAX(location_code), MAX(location_name),
        SUM(received_qty),
        (array_agg(opening_balance ORDER BY month ASC))[1],
        SUM(issued_transfer_qty),
        SUM(issued_adjustment_qty),
        SUM(issued_wasted_qty),
        SUM(total_issued_qty),
        SUM(net_change_qty),
        (array_agg(closing_balance ORDER BY month DESC))[1],
        CASE WHEN SUM(received_qty) > 0
             THEN SUM(received_value) / SUM(received_qty)
             ELSE NULL END,
        SUM(received_value),
        SUM(issued_value),
        SUM(invoice_count),
        SUM(transaction_count)
    FROM stock_monthly_summary
    WHERE (:year IS NULL OR EXTRACT(YEAR FROM month) = :year)
      AND (:quarter IS NULL OR EXTRACT(QUARTER FROM month) = :quarter)
      AND (:location_id IS NULL OR location_id = :location_id)
      AND (:product_id IS NULL OR product_id = CAST(:product_id AS uuid))
    GROUP BY date_trunc('quarter', month), product_id, location_id
    ON CONFLICT (quarter, product_id, location_id)
    DO UPDATE SET
        received_qty = EXCLUDED.received_qty,
        opening_balance = EXCLUDED.opening_balance,
        issued_transfer_qty = EXCLUDED.issued_transfer_qty,
        issued_adjustment_qty = EXCLUDED.issued_adjustment_qty,
        issued_wasted_qty = EXCLUDED.issued_wasted_qty,
        total_issued_qty = EXCLUDED.total_issued_qty,
        net_change_qty = EXCLUDED.net_change_qty,
        closing_balance = EXCLUDED.closing_balance,
        avg_unit_price = EXCLUDED.avg_unit_price,
        received_value = EXCLUDED.received_value,
        issued_value = EXCLUDED.issued_value,
        invoice_count = EXCLUDED.invoice_count,
        transaction_count = EXCLUDED.transaction_count,
        updated_at = now()
""")


@router.post("/refresh")
def refresh_quarterly_summary(
    year: int | None = Query(None, description="Only rebuild this calendar year"),
    quarter: int | None = Query(None, ge=1, le=4, description="Only rebuild this quarter (1-4)"),
    location_id: int | None = Query(None),
    product_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Rebuild stock_quarterly_summary from stock_monthly_summary. Safe to re-run anytime.

    With no filters, rebuilds every quarter/product/location. Any filter passed
    narrows which monthly rows get rolled up (existing rows outside the filter
    are left untouched, not deleted).
    """
    db.execute(
        REFRESH_SQL,
        {"year": year, "quarter": quarter, "location_id": location_id, "product_id": product_id},
    )
    db.commit()
    count = db.query(StockQuarterlySummary).count()
    return {"message": "Quarterly summary refreshed", "row_count": count}


@router.get("", response_model=list[StockQuarterlySummaryOut])
def get_quarterly_summary(
    year: int | None = Query(None),
    quarter: int | None = Query(None, ge=1, le=4),
    location_id: int | None = Query(None),
    product_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(StockQuarterlySummary)
    if year:
        q = q.filter(func.extract("year", StockQuarterlySummary.quarter) == year)
    if quarter:
        q = q.filter(func.extract("quarter", StockQuarterlySummary.quarter) == quarter)
    if location_id:
        q = q.filter(StockQuarterlySummary.location_id == location_id)
    if product_id:
        q = q.filter(StockQuarterlySummary.product_id == product_id)
    rows = q.order_by(StockQuarterlySummary.quarter.desc()).all()

    out = []
    for r in rows:
        item = StockQuarterlySummaryOut.model_validate(r)
        y, m = r.quarter.year, r.quarter.month
        item.quarter_label = f"{y}-Q{(m - 1) // 3 + 1}"
        out.append(item)
    return out