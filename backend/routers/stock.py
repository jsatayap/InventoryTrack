from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
import schemas, auth

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
    status: str | None = Query(None, description="in_stock, issued, transferred, wasted"),
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