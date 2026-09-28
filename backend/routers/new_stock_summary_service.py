"""Stock monthly summary -- data access.

Closed months live in stock_monthly_summary (one row per month/product/
location, one integer column per trade code). Months that are not closed yet
(normally just the current one) are computed live from stock_transactions
with the SAME logic as fn_close_month() in migration 009, so a month looks
the same before and after it is closed.

The per-code columns are dynamic, so everything here uses raw SQL rather
than the ORM model.
"""
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

# Must match the timezone hard-coded in fn_close_month() (009/017) and 010.
STORE_TZ = "Asia/Bangkok"

# Fixed (non-dynamic) keys returned for every row.
FIXED_KEYS = (
    "id", "month", "product_id", "location_id",
    "sku", "product_name", "series", "is_serialized",
    "location_code", "location_name",
    "opening_balance", "received_qty", "total_issued_qty",
    "net_change_qty", "closing_balance",
    "avg_unit_price", "received_value", "issued_value",
    "invoice_count", "transaction_count", "closed_at",
)


def first_of_month(d: date) -> date:
    return d.replace(day=1)


def add_month(d: date) -> date:
    return date(d.year + d.month // 12, d.month % 12 + 1, 1)


# ---------------------------------------------------------------- trade codes

def get_trade_codes(db: Session) -> list[dict]:
    rows = db.execute(text(
        "SELECT id, trade_type, code, column_name, description, sort_order, is_active "
        "FROM trade_codes ORDER BY sort_order, trade_type DESC, code"
    )).mappings().all()
    return [dict(r) for r in rows]


def add_trade_code(db: Session, trade_type: str, code: int, description: str | None) -> str:
    """Registers the code AND adds its column in one transaction (DB function).
    Returns the new column name. Raises DBAPIError on duplicates/bad input."""
    col = db.execute(
        text("SELECT add_trade_code(:t, :c, :d)"),
        {"t": trade_type, "c": code, "d": description},
    ).scalar()
    db.commit()
    return col


# -------------------------------------------------------------------- periods

def current_month(db: Session) -> date:
    return db.execute(
        text("SELECT date_trunc('month', now() AT TIME ZONE :tz)::date"),
        {"tz": STORE_TZ}).scalar()


def _first_open_month(db: Session) -> date | None:
    """Closing is sequential, so the first month that is not closed is the one
    after the last closed month -- or, if nothing is closed yet, the first month
    that has any transactions."""
    last = db.execute(text("SELECT max(month) FROM closed_periods")).scalar()
    if last:
        return add_month(last)
    return db.execute(
        text("SELECT date_trunc('month', min(created_at) AT TIME ZONE :tz)::date "
             "FROM stock_transactions"),
        {"tz": STORE_TZ}).scalar()


def get_period_status(db: Session) -> dict:
    closed = [r[0] for r in db.execute(
        text("SELECT month FROM closed_periods ORDER BY month")).all()]
    nxt = _first_open_month(db)
    return {
        "closed_months": closed,
        "next_month_to_close": nxt,
        "can_close_next": nxt is not None and nxt < current_month(db),
    }


def open_months_between(db: Session, month_from: date, month_to: date) -> list[dict]:
    """Not-closed months that can hold data, limited to [month_from, month_to]."""
    start = _first_open_month(db)
    if start is None:
        return []
    end, out, m = current_month(db), [], start
    while m <= end:
        if month_from <= m <= month_to:
            out.append(m)
        m = add_month(m)
    return out


def close_month(db: Session, month: date) -> int:
    """Calls fn_close_month(). Business-rule failures (unfinished month,
    out of order, unregistered code, ...) surface as DBAPIError with
    SQLSTATE P0001 -- the route turns those into HTTP 400."""
    rows = db.execute(text("SELECT fn_close_month(:m)"), {"m": month}).scalar()
    db.commit()
    return rows


# ------------------------------------------------------------------- reading

def _shape(row: dict, codes: list[dict]) -> dict:
    out = {k: row.get(k) for k in FIXED_KEYS}
    out["is_closed"] = row.get("closed_at") is not None
    out["quantities"] = {c["column_name"]: int(row.get(c["column_name"]) or 0) for c in codes}
    return out


def fetch_closed_rows(db: Session, month_from: date, month_to: date,
                      location_ids=None, product_ids=None,
                      sku=None, product_name=None) -> list[dict]:
    where = ["month BETWEEN :mf AND :mt"]
    params: dict = {"mf": month_from, "mt": month_to}
    if location_ids:
        where.append("location_id = ANY(:location_ids)")
        params["location_ids"] = location_ids
    if product_ids:
        where.append("product_id = ANY(CAST(:product_ids AS uuid[]))")
        params["product_ids"] = [str(p) for p in product_ids]
    if sku:
        where.append("sku ILIKE :sku_pat")
        params["sku_pat"] = f"%{sku}%"
    if product_name:
        where.append("product_name ILIKE :name_pat")
        params["name_pat"] = f"%{product_name}%"
    sql = "SELECT * FROM stock_monthly_summary WHERE " + " AND ".join(where)
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


def fetch_live_rows(db: Session, month: date, codes: list[dict],
                    location_ids=None, product_ids=None,
                    sku=None, product_name=None) -> list[dict]:
    """Same numbers fn_close_month() would write for `month`, without writing."""
    quote = db.get_bind().dialect.identifier_preparer.quote
    params: dict = {"month": month, "tz": STORE_TZ}
    inner, outer = "", ""
    for i, c in enumerate(codes):
        inner += (f", COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at >= b.s "
                  f"AND t.trade_type = :tt{i} AND t.trade_code = :tc{i}), 0)::integer AS c{i}")
        outer += f", a.c{i} AS {quote(c['column_name'])}"
        params[f"tt{i}"] = c["trade_type"]
        params[f"tc{i}"] = c["code"]

    # location/product filters go inside (they don't change any balance, they
    # only pick which product/location pairs are computed)
    extra = ""
    if location_ids:
        extra += " AND t.location_id = ANY(:location_ids)"
        params["location_ids"] = location_ids
    if product_ids:
        extra += " AND t.product_id = ANY(CAST(:product_ids AS uuid[]))"
        params["product_ids"] = [str(p) for p in product_ids]
    outer_where = ""
    if sku:
        outer_where += " AND p.sku ILIKE :sku_pat"
        params["sku_pat"] = f"%{sku}%"
    if product_name:
        outer_where += " AND p.name ILIKE :name_pat"
        params["name_pat"] = f"%{product_name}%"

    sql = f"""
    WITH b AS (
        SELECT (CAST(:month AS date)::timestamp AT TIME ZONE :tz) AS s,
               ((CAST(:month AS date) + interval '1 month')::timestamp AT TIME ZONE :tz) AS e
    )
    SELECT
        CAST(NULL AS integer) AS id, CAST(:month AS date) AS month,
        a.product_id, a.location_id,
        p.sku, p.name AS product_name, p.series, p.is_serialized,
        l.code AS location_code, l.name AS location_name,
        a.opening AS opening_balance, a.rcv AS received_qty, a.iss AS total_issued_qty,
        a.rcv - a.iss AS net_change_qty, a.opening + a.rcv - a.iss AS closing_balance,
        p.price AS avg_unit_price,
        a.rcv * COALESCE(p.price, 0) AS received_value,
        a.iss * COALESCE(p.price, 0) AS issued_value,
        a.inv_cnt AS invoice_count, a.txn_cnt AS transaction_count,
        CAST(NULL AS timestamptz) AS closed_at{outer}
    FROM (
        SELECT
            t.product_id, t.location_id,
            COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at <  b.s AND t.trade_type = 'RCV'), 0)::integer
          - COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at <  b.s AND t.trade_type = 'ISS'), 0)::integer AS opening,
            COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at >= b.s AND t.trade_type = 'RCV'), 0)::integer AS rcv,
            COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at >= b.s AND t.trade_type = 'ISS'), 0)::integer AS iss,
            (COUNT(*) FILTER (WHERE t.created_at >= b.s))::integer AS txn_cnt,
            (COUNT(DISTINCT t.ref_id) FILTER (WHERE t.created_at >= b.s AND t.trade_type = 'RCV' AND t.ref_type = 'invoice'))::integer AS inv_cnt
            {inner}
        FROM stock_transactions t CROSS JOIN b
        WHERE t.created_at < b.e{extra}
        GROUP BY t.product_id, t.location_id
    ) a
    JOIN products  p ON p.id = a.product_id
    JOIN locations l ON l.id = a.location_id
    WHERE (a.opening <> 0 OR a.txn_cnt > 0){outer_where}
    ORDER BY l.code, p.sku
    """
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


def get_summary_range(db: Session, month_from: date, month_to: date,
                      location_ids=None, product_ids=None, sku=None, product_name=None,
                      skip: int = 0, limit: int = 100) -> dict:
    """Closed months come from the stored snapshot, open months are computed
    live; both are merged, sorted (newest month first) and paged."""
    month_from, month_to = first_of_month(month_from), first_of_month(month_to)
    codes = get_trade_codes(db)

    rows = fetch_closed_rows(db, month_from, month_to, location_ids, product_ids, sku, product_name)
    for m in open_months_between(db, month_from, month_to):
        rows += fetch_live_rows(db, m, codes, location_ids, product_ids, sku, product_name)

    rows.sort(key=lambda r: (-r["month"].toordinal(), r["location_name"] or "", r["product_name"] or ""))
    return {
        "columns": codes,
        "total": len(rows),
        "rows": [_shape(r, codes) for r in rows[skip: skip + limit]],
    }


def get_monthly_trend(db: Session, cutoff: date, location_ids=None, product_ids=None) -> list[dict]:
    """Received/issued totals per month from `cutoff` on: stored snapshot for
    closed months, straight from stock_transactions for months not closed yet."""
    params: dict = {"cutoff": cutoff, "tz": STORE_TZ}
    closed_f, open_f = "", ""
    if location_ids:
        params["location_ids"] = location_ids
        closed_f += " AND location_id = ANY(:location_ids)"
        open_f += " AND t.location_id = ANY(:location_ids)"
    if product_ids:
        params["product_ids"] = [str(p) for p in product_ids]
        closed_f += " AND product_id = ANY(CAST(:product_ids AS uuid[]))"
        open_f += " AND t.product_id = ANY(CAST(:product_ids AS uuid[]))"

    closed = db.execute(text(f"""
        SELECT month, SUM(received_qty) AS received, SUM(total_issued_qty) AS issued
        FROM stock_monthly_summary WHERE month >= :cutoff{closed_f} GROUP BY month"""),
        params).mappings().all()

    live = db.execute(text(f"""
        SELECT date_trunc('month', t.created_at AT TIME ZONE :tz)::date AS month,
               COALESCE(SUM(t.quantity) FILTER (WHERE t.trade_type = 'RCV'), 0) AS received,
               COALESCE(SUM(t.quantity) FILTER (WHERE t.trade_type = 'ISS'), 0) AS issued
        FROM stock_transactions t
        WHERE t.created_at >= (CAST(:cutoff AS date)::timestamp AT TIME ZONE :tz)
          AND NOT EXISTS (SELECT 1 FROM closed_periods c
                          WHERE c.month = date_trunc('month', t.created_at AT TIME ZONE :tz)::date){open_f}
        GROUP BY 1"""), params).mappings().all()

    merged = {r["month"]: dict(r) for r in closed}
    merged.update({r["month"]: dict(r) for r in live})
    # A closed month also holds carried-forward rows with no movement; keep the
    # old behaviour of only listing months that had receives or issues.
    return [merged[m] for m in sorted(merged) if merged[m]["received"] or merged[m]["issued"]]