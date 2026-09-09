from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models, schemas, auth

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("", response_model=list[schemas.LocationOut])
def list_locations(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    query = db.query(models.Location)
    if not include_inactive:
        query = query.filter(models.Location.is_active.is_(True))
    return query.order_by(models.Location.name).all()


@router.get("/{location_id}", response_model=schemas.LocationOut)
def get_location(location_id: int, db: Session = Depends(get_db), current_user=Depends(auth.get_current_user)):
    location = db.query(models.Location).filter(models.Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location


@router.post("", response_model=schemas.LocationOut, status_code=201)
def create_location(
    payload: schemas.LocationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    existing = db.query(models.Location).filter(models.Location.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Location code '{payload.code}' already exists")

    location = models.Location(**payload.model_dump())
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.put("/{location_id}", response_model=schemas.LocationOut)
def update_location(
    location_id: int,
    payload: schemas.LocationUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    location = db.query(models.Location).filter(models.Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(location, field, value)

    db.commit()
    db.refresh(location)
    return location


@router.delete("/{location_id}", status_code=204)
def deactivate_location(
    location_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    """Soft delete: locations are referenced by stock/invoices, so we never hard-delete."""
    location = db.query(models.Location).filter(models.Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    location.is_active = False
    db.commit()
    return None