"""
One-off backfill script.

Closes every month from your earliest stock_transactions record up
through (but not including) the current month, in chronological order,
skipping any month that's already closed.

Run once, manually, from your backend project root:
    python scripts/backfill_stock_summary.py

Safe to re-run: months already marked 'closed' in stock_summary_control
are skipped, not rebuilt. (If you want a month rebuilt, delete its row
from stock_summary_control and drop its table first, same as before.)
"""

from datetime import date
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import SessionLocal
from services.stock_summary import _close_month, _shift_month
from sqlalchemy import text


def backfill():
    db = SessionLocal()
    try:
        # find the earliest transaction we have, to know where to start
        earliest = db.execute(
            text("SELECT MIN(created_at) AS min_date FROM stock_transactions")
        ).fetchone()

        if earliest is None or earliest.min_date is None:
            print("No transactions found -- nothing to backfill.")
            return

        month = earliest.min_date.date().replace(day=1)
        today_month_start = date.today().replace(day=1)

        # months already closed -- so we don't rebuild them
        closed_rows = db.execute(
            text("SELECT year_month FROM stock_summary_control WHERE status = 'closed'")
        ).fetchall()
        already_closed = {row.year_month for row in closed_rows}

        while month < today_month_start:
            if month in already_closed:
                print(f"{month:%Y-%m} already closed, skipping.")
            else:
                print(f"Closing {month:%Y-%m}...")
                _close_month(db, month)
                print(f"  done -- {month:%Y-%m} closed.")
            month = _shift_month(month, 1)

        print("Backfill complete.")
    finally:
        db.close()


if __name__ == "__main__":
    backfill()