"""
One-off script to create the first admin user + a sample location.
Run with:  python seed_admin.py
"""
from database import SessionLocal
import models, auth

db = SessionLocal()

try:
    # Sample location
    loc = db.query(models.Location).filter_by(code="HQ").first()
    if not loc:
        loc = models.Location(code="HQ", name="Head Office", address="")
        db.add(loc)
        db.commit()
        db.refresh(loc)
        print(f"Created location: {loc.name}")

    # Admin user
    existing = db.query(models.User).filter_by(username="admin").first()
    if existing:
        print("Admin user already exists.")
    else:
        admin = models.User(
            username="admin",
            password_hash=auth.hash_password("admin123"),  # CHANGE THIS after first login
            full_name="Administrator",
            role="admin",
            location_id=loc.id,
        )
        db.add(admin)
        db.commit()
        print("Created admin user -> username: admin / password: admin123")
finally:
    db.close()