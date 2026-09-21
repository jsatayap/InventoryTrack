"""
Stock monthly summary — close-on-login logic.

Called once per login (see auth_router.py). Checks whether the previous
calendar month has been frozen into its own stock_summary_<year>_<month>
table yet. If not, builds it from stock_transactions and marks it closed
in stock_summary_control. Cheap no-op on every day this isn't needed.

Does not touch stock_monthly_summary / stock_quarterly_summary or any
other existing table -- this is a separate, new set of tables.
"""

from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session


def check_and_close_previous_month(db: Session) -> None:
    """Entry point -- call this on login."""
    today = date.today()

    # first day of the CURRENT month, e.g. today 2026-09-21 -> 2026-09-01
    current_month_start = today.replace(day=1)

    # first day of the PREVIOUS month, e.g. 2026-08-01
    prev_month_start = _shift_month(current_month_start, -1)

    # has the previous month already been closed?
    row = db.execute(
        text("SELECT status FROM stock_summary_control WHERE year_month = :ym"),
        {"ym": prev_month_start},
    ).fetchone()

    if row is not None and row.status == "closed":
        return  # already done, nothing to do today

    # not closed yet (or no control row at all) -> close it now
    _close_month(db, prev_month_start)


def _shift_month(d: date, months: int) -> date:
    """Return the 1st of the month that is `months` away from d (d must be the 1st)."""
    month_index = d.month - 1 + months          # 0-based month, can go negative or > 11
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _close_month(db: Session, month_start: date) -> None:
    """
    Builds and freezes the summary table for the given month.
    month_start must be the 1st day of that month.
    """
    table_name = f"stock_summary_{month_start.year}_{month_start.month:02d}"
    next_month_start = _shift_month(month_start, 1)
    prior_month_start = _shift_month(month_start, -1)

    # find the PREVIOUS month's table (to pull begin_qty from), if it was ever closed
    prior_row = db.execute(
        text("SELECT table_name FROM stock_summary_control WHERE year_month = :ym AND status = 'closed'"),
        {"ym": prior_month_start},
    ).fetchone()
    prior_table = prior_row.table_name if prior_row else None

    if prior_table:
        prev_join_sql = f"LEFT JOIN {prior_table} prev ON prev.product_id = c.product_id AND prev.location_id = c.location_id"
        combos_prev_sql = f"UNION SELECT product_id, location_id FROM {prior_table}"
        begin_qty_sql = "COALESCE(prev.close_qty, 0)"
    else:
        prev_join_sql = ""
        combos_prev_sql = ""
        begin_qty_sql = "0"

    # Guard: if a table from this name already exists (e.g. a previous run
    # got interrupted midway), drop it and rebuild from scratch.
    db.execute(text(f"DROP TABLE IF EXISTS {table_name}"))

    create_sql = f"""
        CREATE TABLE {table_name} AS
        WITH this_month_tx AS (
            -- only the transactions that happened during this month
            SELECT product_id, location_id, trade_type, trade_code, quantity
            FROM stock_transactions
            WHERE created_at >= :month_start AND created_at < :next_month_start
        ),
        agg AS (
            -- pivot trade_type/trade_code into named columns, one row per product+location
            SELECT
                product_id, location_id,
                SUM(CASE WHEN trade_type = 'RCV' AND trade_code = 0  THEN quantity ELSE 0 END) AS receive_00_qty,
                SUM(CASE WHEN trade_type = 'RCV' AND trade_code = 1  THEN quantity ELSE 0 END) AS receive_01_qty,
                SUM(CASE WHEN trade_type = 'RCV' AND trade_code = 55 THEN quantity ELSE 0 END) AS receive_55_qty,
                SUM(CASE WHEN trade_type = 'ISS' AND trade_code = 1  THEN quantity ELSE 0 END) AS issue_01_qty,
                SUM(CASE WHEN trade_type = 'ISS' AND trade_code = 55 THEN quantity ELSE 0 END) AS issue_55_qty,
                SUM(CASE WHEN trade_type = 'ISS' AND trade_code = 99 THEN quantity ELSE 0 END) AS issue_99_qty
            FROM this_month_tx
            GROUP BY product_id, location_id
        ),
        combos AS (
            -- every product+location that either moved this month, or carried a balance from last month
            SELECT product_id, location_id FROM agg
            {combos_prev_sql}
        )
        SELECT
            c.product_id,
            c.location_id,
            {begin_qty_sql} AS begin_qty,
            COALESCE(a.receive_00_qty, 0) AS receive_00_qty,
            COALESCE(a.receive_01_qty, 0) AS receive_01_qty,
            COALESCE(a.receive_55_qty, 0) AS receive_55_qty,
            COALESCE(a.issue_01_qty, 0) AS issue_01_qty,
            COALESCE(a.issue_55_qty, 0) AS issue_55_qty,
            COALESCE(a.issue_99_qty, 0) AS issue_99_qty,
            {begin_qty_sql}
                + COALESCE(a.receive_00_qty, 0) + COALESCE(a.receive_01_qty, 0) + COALESCE(a.receive_55_qty, 0)
                - COALESCE(a.issue_01_qty, 0) - COALESCE(a.issue_55_qty, 0) - COALESCE(a.issue_99_qty, 0)
                AS close_qty
        FROM combos c
        LEFT JOIN agg a ON a.product_id = c.product_id AND a.location_id = c.location_id
        {prev_join_sql}
    """
    db.execute(text(create_sql), {"month_start": month_start, "next_month_start": next_month_start})

    # give the new table a real primary key so it behaves like a normal table
    db.execute(text(f"ALTER TABLE {table_name} ADD PRIMARY KEY (product_id, location_id)"))

    # record it as closed in the control table.
    # MERGE requires Postgres 15+; if you're on an older version, swap this
    # for INSERT ... ON CONFLICT (year_month) DO UPDATE SET ... instead.
    db.execute(
        text("""
            MERGE INTO stock_summary_control AS t
            USING (SELECT CAST(:ym AS date) AS year_month, CAST(:tn AS varchar) AS table_name) AS s
            ON t.year_month = s.year_month
            WHEN MATCHED THEN
                UPDATE SET table_name = s.table_name, status = 'closed', closed_at = now()
            WHEN NOT MATCHED THEN
                INSERT (year_month, table_name, status, closed_at)
                VALUES (s.year_month, s.table_name, 'closed', now())
        """),
        {"ym": month_start, "tn": table_name},
    )

    db.commit()