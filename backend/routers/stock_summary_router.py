"""
Read-only access to closed stock summary months.

GET /stock-summary/2026/08 -> rows from stock_summary_2026_08,
joined with product/location names for display.

Only ever reads from stock_summary_control + the frozen monthly tables.
Never writes -- closing happens on login (see services/stock_summary.py).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
import uuid

from database import get_db
import auth

router = APIRouter(prefix="/stock-summary", tags=["stock-summary"])


class StockSummaryRowOut(BaseModel):
    product_id: uuid.UUID
    sku: str
    product_name: str
    series: str | None = None
    location_id: int
    location_code: str
    location_name: str

    begin_qty: int
    receive_00_qty: int
    receive_01_qty: int
    receive_55_qty: int
    issue_01_qty: int
    issue_55_qty: int
    issue_99_qty: int
    close_qty: int


@router.get("/{year}/{month}", response_model=list[StockSummaryRowOut])
def get_closed_month_summary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),  # any logged-in user can view
):
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")

    # Look up the real table name from the control table -- this is also
    # what keeps the query injection-safe: table_name never comes directly
    # from the URL, only from a row we already trust in our own DB.
    row = db.execute(
        text("""
            SELECT table_name, status FROM stock_summary_control
            WHERE year_month = make_date(:year, :month, 1)
        """),
        {"year": year, "month": month},
    ).fetchone()

    if row is None or row.status != "closed":
        raise HTTPException(
            status_code=404,
            detail=f"{year}-{month:02d} has not been closed yet -- nothing to show",
        )

    table_name = row.table_name

    results = db.execute(
        text(f"""
            SELECT
                s.product_id,
                p.sku,
                p.name AS product_name,
                p.series,
                s.location_id,
                l.code AS location_code,
                l.name AS location_name,
                s.begin_qty,
                s.receive_00_qty,
                s.receive_01_qty,
                s.receive_55_qty,
                s.issue_01_qty,
                s.issue_55_qty,
                s.issue_99_qty,
                s.close_qty
            FROM {table_name} s
            JOIN products p ON p.id = s.product_id
            JOIN locations l ON l.id = s.location_id
            ORDER BY l.name, p.name
        """)
    ).mappings().all()

    return results