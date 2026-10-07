from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from models.database import get_db
from models.ngo import NGO
from models.user import User
from schemas.auth import LinkNgoRequest, LoginRequest, RegisterRequest, TokenResponse, UserOut
from services.auth_service import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Auth"])


_email_adapter = TypeAdapter(EmailStr)


@router.get("/email-available")
def email_available(email: str, db: Session = Depends(get_db)):
    """Used by the sign-up form for live validation."""
    try:
        normalized = _email_adapter.validate_python(email.strip()).lower()
    except ValidationError:
        return {"valid": False, "available": False}
    taken = db.query(User).filter(User.email == normalized).first() is not None
    return {"valid": True, "available": not taken}


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id), user=user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return TokenResponse(access_token=create_access_token(user.id), user=user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/me/ngo", response_model=UserOut)
def link_ngo(payload: LinkNgoRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ngo = db.query(NGO).filter(NGO.id == payload.ngo_id).first()
    if not ngo:
        raise HTTPException(status_code=404, detail="NGO not found.")
    # Only allow joining an NGO that nobody else has claimed yet (no invitation flow yet).
    other_member = db.query(User).filter(User.ngo_id == ngo.id, User.id != user.id).first()
    if user.ngo_id != ngo.id and other_member:
        raise HTTPException(status_code=403, detail="This NGO already belongs to another account.")
    user.ngo_id = ngo.id
    db.commit()
    db.refresh(user)
    return user
