from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database import get_db
import auth, schemas
from services.stock_summary import check_and_close_previous_month  # new import

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if last month's stock summary needs closing.
    # Wrapped so that if this ever fails, it never blocks someone from logging in.
    try:
        check_and_close_previous_month(db)
    except Exception:
        db.rollback()  # don't leave the session in a broken state for the rest of the request
        import traceback
        print("WARNING: check_and_close_previous_month failed -- investigate stock_summary_control")
        traceback.print_exc()  # TODO: replace with real logging once you've set up a logger

    access_token = auth.create_access_token(data={"sub": user.username})
    return schemas.Token(access_token=access_token)


@router.get("/me", response_model=schemas.UserOut)
def read_current_user(current_user=Depends(auth.get_current_user)):
    return current_user