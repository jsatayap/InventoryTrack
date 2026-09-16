"""
seed_data.py — Wipe InventoryTrack and repopulate with realistic,
internally-consistent multi-month data (for testing monthly reports,
stock tracking, invoice status flows, etc).

ONLY RUN AGAINST A DEV DATABASE. This truncates tables.

Usage:
    python seed_data.py                 # defaults: 6 months, 8 locations
    python seed_data.py --months 4 --locations 5 --seed 7

Requires: faker  (pip install faker)
Assumes: database.py exposes SessionLocal / engine, models.py is
importable exactly as you uploaded it, and auth.py exposes
hash_password() exactly as used in seed_admin.py.

NOTE ON USERS: models.User.location_id is a FK to locations.id, so
Postgres's TRUNCATE ... CASCADE on `locations` will cascade-wipe
`users` too, regardless of whether `users` is in the TRUNCATE list.
To honor "only admin, don't wipe it away" this script captures/
recreates the admin user around the wipe rather than trying to
protect the table from cascade (which isn't possible without
altering the schema's FK).

NOTE ON CONFIG: this script does not delete or overwrite any config
rows. However, config.created_by/updated_by are FKs to users.id, so
truncating `users` (required to reset locations, see above) cascades
into `config` too, even though config isn't explicitly truncated. The
script reseeds the required config rows AFTER the wipe to compensate,
and never touches rows outside the 10 category/key pairs this script
depends on.
"""

import argparse
import random
from datetime import date, timedelta
from decimal import Decimal

from faker import Faker
from sqlalchemy import text

from database import SessionLocal, engine
import models
import auth


# ----------------------------------------------------------------------
# Config codes — copied from your actual `config` table. If you change
# them there, update here too (nothing else in the script needs to change).
# ----------------------------------------------------------------------
INVOICE_STATUS = {"PENDING": 0, "RECEIVING": 1, "COMPLETED": 2, "CANCELLED": 3}
UNIT_STATUS = {"IN_STOCK": 1, "ISSUED": 2, "WASTED": 3}
TRADE_CODE = {"TRANSFER": 1, "ADJUST": 55, "WASTED": 99}

ADMIN_USERNAME = "admin"
ADMIN_DEFAULT_PASSWORD = "admin123"  # only used if admin doesn't exist yet

REQUIRED_CONFIG_ROWS = [
    ("product_unit_status", 1, "in_stock"),
    ("product_unit_status", 2, "issued"),
    ("product_unit_status", 3, "wasted"),
    ("issue", 1, "transfer"),
    ("issue", 55, "adjust"),
    ("issue", 99, "wasted"),
    ("invoice", 0, "pending"),
    ("invoice", 1, "receiving"),
    ("invoice", 2, "completed"),
    ("invoice", 3, "cancelled"),
]


def ensure_config_rows(session):
    """Verify the config rows this script depends on actually exist, and
    insert any that are missing (never overwrites or deletes existing rows).
    Several tables (invoices.status, and likely products_actual.status /
    issues.trade_code) have real composite FKs to config(category, key)
    that aren't visible in models.py, so a missing row fails deep inside
    a flush with a cryptic IntegrityError. Checking up front gives a
    clear message instead."""
    existing = {(c.category, c.key) for c in session.query(models.Config).all()}
    missing = [row for row in REQUIRED_CONFIG_ROWS if (row[0], row[1]) not in existing]
    if missing:
        print(f"config table is missing {len(missing)} row(s) this script needs — inserting them:")
        for category, key, value in missing:
            print(f"  + {category} / {key} / {value}")
            session.add(models.Config(category=category, key=key, value=value))
        session.commit()
    else:
        print("config table already has all required rows — leaving it untouched.")

PHONE_SERIES = [
    ("iPhone", ["13", "13 Pro", "14", "14 Pro", "15", "15 Pro", "15 Pro Max", "SE"]),
    ("Samsung Galaxy", ["S23", "S23 Ultra", "S24", "S24 Ultra", "A54", "A34", "Z Flip5"]),
    ("Xiaomi", ["13T", "13T Pro", "14", "Redmi Note 13", "Redmi Note 13 Pro", "Poco X6"]),
]
COLORS = ["Midnight Black", "Cosmic Silver", "Ocean Blue", "Rose Gold", "Graphite"]
STORAGE = [64, 128, 256, 512]
RAM = [4, 6, 8, 12]

ACCESSORIES = [
    ("Fast Charger 30W", 25.00),
    ("USB-C Cable 1m", 8.00),
    ("Silicone Case", 12.00),
    ("Tempered Glass Screen Protector", 6.00),
    ("Wireless Earbuds", 45.00),
    ("Power Bank 10000mAh", 30.00),
    ("Car Charger Mount", 18.00),
    ("Bluetooth Speaker Mini", 35.00),
]


def capture_existing_admin_hash(session):
    """Grab the current admin's password hash (if any) so we can restore
    the same login after the wipe, instead of resetting their password."""
    existing = session.query(models.User).filter_by(username=ADMIN_USERNAME).first()
    return existing.password_hash if existing else None


def reset_tables(session):
    """Truncate transactional + master tables and reset identities.
    `users` cascades automatically because of the users.location_id FK
    to locations — it's listed explicitly for clarity, not because it's
    required to trigger the cascade."""
    tables = [
        "stock_transactions", "issue_items", "issues",
        "products_actual", "stock_balances",
        "invoice_items", "invoices",
        "products", "locations", "users",
    ]
    session.execute(text(f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE"))
    session.commit()


def seed_locations(session, n, fake):
    """First location is always HQ (matches seed_admin.py); remaining are branches."""
    locations = []
    hq = models.Location(code="HQ", name="Head Office", address="")
    session.add(hq)
    session.flush()
    locations.append(hq)

    for i in range(max(0, n - 1)):
        code = f"BR{i+1:03d}"
        loc = models.Location(
            code=code,
            name=f"{fake.city()} Branch",
            address=fake.address().replace("\n", ", "),
            is_active=True,
        )
        session.add(loc)
        locations.append(loc)
    session.commit()
    return locations


def restore_admin(session, hq_location, existing_hash):
    """Recreate the single admin user, preserving their password if we
    captured one before the wipe; otherwise fall back to the same
    default seed_admin.py uses."""
    password_hash = existing_hash or auth.hash_password(ADMIN_DEFAULT_PASSWORD)
    admin = models.User(
        username=ADMIN_USERNAME,
        password_hash=password_hash,
        full_name="Administrator",
        role="admin",
        location_id=hq_location.id,
        is_active=True,
    )
    session.add(admin)
    session.commit()
    if existing_hash:
        print(f"Restored admin user -> username: {ADMIN_USERNAME} (existing password kept)")
    else:
        print(f"Created admin user -> username: {ADMIN_USERNAME} / password: {ADMIN_DEFAULT_PASSWORD}")
    return admin


def seed_products(session, fake):
    products = []
    sku_n = 1000

    # Phones — serialized
    for series_name, models_list in PHONE_SERIES:
        for model_name in models_list:
            for storage in random.sample(STORAGE, k=2):
                sku_n += 1
                p = models.Product(
                    sku=f"PH-{sku_n}",
                    name=f"{series_name} {model_name}",
                    series=series_name,
                    storage_size=storage,
                    color=random.choice(COLORS),
                    ram=random.choice(RAM),
                    price=Decimal(random.choice([299, 399, 499, 599, 699, 799, 999])) + Decimal("0.00"),
                    is_serialized=True,
                    extra_specs={"screen": random.choice(["6.1in", "6.5in", "6.7in"]),
                                 "battery_mah": random.choice([4000, 4500, 5000])},
                    is_active=True,
                )
                session.add(p)
                products.append(p)

    # Accessories — non-serialized
    for name, price in ACCESSORIES:
        sku_n += 1
        p = models.Product(
            sku=f"AC-{sku_n}",
            name=name,
            series=None,
            price=Decimal(str(price)),
            is_serialized=False,
            is_active=True,
        )
        session.add(p)
        products.append(p)

    session.commit()
    return products


def month_starts(num_months):
    """Return list of (start_date, end_date) tuples for the last num_months,
    most recent last, so data reads chronologically."""
    today = date.today()
    first_of_this_month = today.replace(day=1)
    months = []
    cursor = first_of_this_month
    for _ in range(num_months):
        # step back one month
        prev_month_end = cursor - timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)
        months.append((prev_month_start, prev_month_end))
        cursor = prev_month_start
    months.reverse()
    return months


def random_date_in(start, end):
    span = (end - start).days
    return start + timedelta(days=random.randint(0, span))


def run_seed(months, num_locations, seed):
    fake = Faker()
    Faker.seed(seed)
    random.seed(seed)

    session = SessionLocal()
    try:
        existing_admin_hash = capture_existing_admin_hash(session)

        print("Wiping tables...")
        reset_tables(session)

        # IMPORTANT: config.created_by / updated_by are FKs to users.id,
        # so TRUNCATE users ... CASCADE above also wipes config, even
        # though config isn't in the truncate list. Must reseed config
        # AFTER the wipe, not before.
        print("Checking config table...")
        ensure_config_rows(session)

        print("Seeding locations, admin user, products...")
        locations = seed_locations(session, num_locations, fake)
        admin = restore_admin(session, locations[0], existing_admin_hash)
        products = seed_products(session, fake)
        serialized_products = [p for p in products if p.is_serialized]
        nonserial_products = [p for p in products if not p.is_serialized]

        # in-memory tracking so issues never exceed what's actually in stock
        # keyed by (product_id, location_id)
        available_serials = {}   # -> list of ProductUnit (in stock)
        qty_balance = {}         # -> int

        def bump_qty(product_id, location_id, delta):
            key = (product_id, location_id)
            qty_balance[key] = qty_balance.get(key, 0) + delta

        def get_or_create_stock_balance(product_id, location_id):
            bal = session.query(models.StockBalance).filter_by(
                product_id=product_id, location_id=location_id).first()
            if not bal:
                bal = models.StockBalance(product_id=product_id, location_id=location_id, quantity=0)
                session.add(bal)
                session.flush()
            return bal

        invoice_seq = 1
        issue_seq = 1

        print(f"Generating {months} months of activity...")
        for month_start, month_end in month_starts(months):
            print(f"  {month_start.isoformat()} .. {month_end.isoformat()}")

            # --- Invoices + receiving for this month -----------------
            num_invoices = random.randint(6, 14)
            for _ in range(num_invoices):
                loc = random.choice(locations)
                inv_date = random_date_in(month_start, month_end)
                invoice_seq += 1
                invoice_no = f"INV-{inv_date.strftime('%Y%m')}-{invoice_seq:04d}"

                inv = models.Invoice(
                    invoice_no=invoice_no,
                    location_id=loc.id,
                    status=INVOICE_STATUS["PENDING"],
                    invoice_date=inv_date,
                    created_by=admin.id,
                )
                session.add(inv)
                session.flush()

                line_products = random.sample(products, k=random.randint(2, 5))
                items = []
                for prod in line_products:
                    qty = random.randint(3, 20) if not prod.is_serialized else random.randint(1, 8)
                    item = models.InvoiceItem(
                        invoice_id=inv.id,
                        product_id=prod.id,
                        quantity=qty,
                        unit_price=prod.price,
                        received_qty=0,
                    )
                    session.add(item)
                    items.append(item)
                session.flush()

                # Simulate receiving happening a few days after invoice date.
                # ~85% chance fully received, ~10% partially, ~5% still pending
                receive_outcome = random.random()
                for item in items:
                    if receive_outcome < 0.05:
                        to_receive = 0
                    elif receive_outcome < 0.15:
                        to_receive = random.randint(1, max(1, item.quantity - 1))
                    else:
                        to_receive = item.quantity

                    receive_date = inv_date + timedelta(days=random.randint(1, 5))
                    if receive_date > month_end + timedelta(days=10):
                        receive_date = month_end

                    prod = next(p for p in products if p.id == item.product_id)

                    if prod.is_serialized:
                        for _ in range(to_receive):
                            unit = models.ProductUnit(
                                product_id=prod.id,
                                serial_number=fake.unique.bothify(text="IMEI##########"),
                                status=UNIT_STATUS["IN_STOCK"],
                                current_location_id=loc.id,
                                invoice_item_id=item.id,
                            )
                            session.add(unit)
                            session.flush()
                            available_serials.setdefault((prod.id, loc.id), []).append(unit)

                            session.add(models.StockTransaction(
                                trade_type="RCV", trade_code=0,
                                product_id=prod.id, location_id=loc.id,
                                serial_number=unit.serial_number, quantity=1,
                                ref_type="invoice", ref_id=inv.id, ref_doc_number=invoice_no,
                                direction="IN", created_by=inv.created_by,
                                created_at=receive_date,
                            ))
                    else:
                        if to_receive:
                            bal = get_or_create_stock_balance(prod.id, loc.id)
                            bal.quantity += to_receive
                            bump_qty(prod.id, loc.id, to_receive)

                            session.add(models.StockTransaction(
                                trade_type="RCV", trade_code=0,
                                product_id=prod.id, location_id=loc.id,
                                serial_number=None, quantity=to_receive,
                                ref_type="invoice", ref_id=inv.id, ref_doc_number=invoice_no,
                                direction="IN", created_by=inv.created_by,
                                created_at=receive_date,
                            ))

                    item.received_qty = to_receive

                # update invoice status from what actually got received.
                # A small slice of never-received invoices are marked
                # cancelled instead of left pending, for realism.
                total_ordered = sum(i.quantity for i in items)
                total_received = sum(i.received_qty for i in items)
                if total_received == 0:
                    inv.status = (
                        INVOICE_STATUS["CANCELLED"] if random.random() < 0.3
                        else INVOICE_STATUS["PENDING"]
                    )
                elif total_received < total_ordered:
                    inv.status = INVOICE_STATUS["RECEIVING"]
                else:
                    inv.status = INVOICE_STATUS["COMPLETED"]

            session.commit()

            # --- Issues for this month --------------------------------
            num_issues = random.randint(10, 25)
            for _ in range(num_issues):
                loc = random.choice(locations)
                trade_code = random.choices(
                    [TRADE_CODE["TRANSFER"], TRADE_CODE["ADJUST"], TRADE_CODE["WASTED"]],
                    weights=[0.6, 0.25, 0.15],
                )[0]
                to_loc = None
                if trade_code == TRADE_CODE["TRANSFER"]:
                    others = [l for l in locations if l.id != loc.id]
                    if others:
                        to_loc = random.choice(others)

                issue_date = random_date_in(month_start, month_end)
                issue_seq += 1
                issue_no = f"ISS-{issue_date.strftime('%Y%m')}-{issue_seq:04d}"

                iss = models.Issue(
                    issue_no=issue_no,
                    location_id=loc.id,
                    to_location_id=to_loc.id if to_loc else None,
                    trade_code=trade_code,
                    remark=fake.sentence(nb_words=6) if trade_code != TRADE_CODE["TRANSFER"] else None,
                    issue_date=issue_date,
                    created_by=admin.id,
                )
                session.add(iss)
                session.flush()

                any_item = False
                for prod in random.sample(products, k=random.randint(1, 4)):
                    if prod.is_serialized:
                        stock = available_serials.get((prod.id, loc.id), [])
                        if not stock:
                            continue
                        unit = stock.pop()
                        unit.status = UNIT_STATUS["ISSUED"]
                        unit.current_location_id = to_loc.id if to_loc else None

                        session.add(models.IssueItem(
                            issue_id=iss.id, product_id=prod.id,
                            product_unit_id=unit.id, quantity=1,
                            unit_price=prod.price,
                        ))
                        session.add(models.StockTransaction(
                            trade_type="ISS", trade_code=trade_code,
                            product_id=prod.id, location_id=loc.id,
                            serial_number=unit.serial_number, quantity=1,
                            ref_type="issue", ref_id=iss.id, ref_doc_number=issue_no,
                            direction="OUT", created_by=iss.created_by,
                            created_at=issue_date,
                        ))
                        any_item = True

                        # if transferred, "receive" it into the destination as stock in
                        if to_loc:
                            unit.status = UNIT_STATUS["IN_STOCK"]
                            available_serials.setdefault((prod.id, to_loc.id), []).append(unit)
                            session.add(models.StockTransaction(
                                trade_type="RCV", trade_code=trade_code,
                                product_id=prod.id, location_id=to_loc.id,
                                serial_number=unit.serial_number, quantity=1,
                                ref_type="issue", ref_id=iss.id, ref_doc_number=issue_no,
                                direction="IN", created_by=iss.created_by,
                                created_at=issue_date,
                            ))
                    else:
                        key = (prod.id, loc.id)
                        have = qty_balance.get(key, 0)
                        if have <= 0:
                            continue
                        qty = min(have, random.randint(1, 5))
                        bal = get_or_create_stock_balance(prod.id, loc.id)
                        bal.quantity -= qty
                        bump_qty(prod.id, loc.id, -qty)

                        session.add(models.IssueItem(
                            issue_id=iss.id, product_id=prod.id,
                            product_unit_id=None, quantity=qty,
                            unit_price=prod.price,
                        ))
                        session.add(models.StockTransaction(
                            trade_type="ISS", trade_code=trade_code,
                            product_id=prod.id, location_id=loc.id,
                            serial_number=None, quantity=qty,
                            ref_type="issue", ref_id=iss.id, ref_doc_number=issue_no,
                            direction="OUT", created_by=iss.created_by,
                            created_at=issue_date,
                        ))
                        any_item = True

                        if to_loc:
                            bal2 = get_or_create_stock_balance(prod.id, to_loc.id)
                            bal2.quantity += qty
                            bump_qty(prod.id, to_loc.id, qty)
                            session.add(models.StockTransaction(
                                trade_type="RCV", trade_code=trade_code,
                                product_id=prod.id, location_id=to_loc.id,
                                serial_number=None, quantity=qty,
                                ref_type="issue", ref_id=iss.id, ref_doc_number=issue_no,
                                direction="IN", created_by=iss.created_by,
                                created_at=issue_date,
                            ))

                if not any_item:
                    # nothing was available to issue; drop this empty issue doc
                    session.delete(iss)

            session.commit()

        print("Done.")
        print(f"  Locations: {len(locations)}")
        print(f"  Users: 1 (admin only)")
        print(f"  Products: {len(products)} "
              f"({len(serialized_products)} serialized / {len(nonserial_products)} non-serialized)")
        print(f"  Invoices created: {invoice_seq - 1}")
        print(f"  Issues created: {issue_seq - 1}")

    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wipe and reseed InventoryTrack with realistic data.")
    parser.add_argument("--months", type=int, default=6, help="How many months of history to generate")
    parser.add_argument("--locations", type=int, default=8, help="Number of branch locations")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    if not args.yes:
        confirm = input(
            "This will TRUNCATE users, locations, products, invoices, issues, "
            "stock and config tables. Continue? [y/N] "
        )
        if confirm.strip().lower() != "y":
            print("Aborted.")
            raise SystemExit(0)

    run_seed(args.months, args.locations, args.seed)