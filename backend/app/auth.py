from datetime import datetime, timedelta, timezone
import secrets

import jwt
from bson import ObjectId
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from jwt import InvalidTokenError
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError
from pwdlib import PasswordHash

from app.settings import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
SESSION_COOKIE = "tandem_session"
TOKEN_SECRET = settings.auth_secret_key or secrets.token_urlsafe(48)
password_hash = PasswordHash.recommended()


class RegisterRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    company_name: str | None = Field(default=None, max_length=100)
    invite_code: str | None = Field(default=None, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "display_name": user["display_name"],
        "email": user["email"],
        "role": user["role"],
    }


def serialize_company(company: dict, *, include_invite_code: bool = False) -> dict:
    result = {"id": str(company["_id"]), "name": company["name"]}
    if include_invite_code:
        result["invite_code"] = company["invite_code"]
    return result


def create_session_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user["_id"]),
            "company_id": str(user["company_id"]),
            "iat": now,
            "exp": now + timedelta(hours=settings.auth_session_hours),
        },
        TOKEN_SECRET,
        algorithm="HS256",
    )


def set_session_cookie(response: Response, user: dict) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(user),
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="strict",
        max_age=settings.auth_session_hours * 60 * 60,
        path="/api",
    )


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Email ou mot de passe invalide.",
    )


async def get_current_user(
    request: Request,
    token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict:
    if not token:
        raise unauthorized()
    try:
        claims = jwt.decode(token, TOKEN_SECRET, algorithms=["HS256"])
        user_id = claims.get("sub", "")
        company_id = claims.get("company_id", "")
        if not ObjectId.is_valid(user_id) or not ObjectId.is_valid(company_id):
            raise unauthorized()
    except InvalidTokenError:
        raise unauthorized() from None

    user = await request.app.state.database.users.find_one(
        {"_id": ObjectId(user_id), "company_id": ObjectId(company_id)}
    )
    if user is None:
        raise unauthorized()
    return user


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request, response: Response):
    company_name = (payload.company_name or "").strip()
    invite_code = (payload.invite_code or "").strip()
    if bool(company_name) == bool(invite_code):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Indiquez un nom d'entreprise ou un code d'invitation.",
        )

    database = request.app.state.database
    created_company_id = None
    if company_name:
        company = {
            "name": company_name,
            "invite_code": secrets.token_urlsafe(9),
            "created_at": datetime.now(timezone.utc),
        }
        created_company_id = (await database.companies.insert_one(company)).inserted_id
        company_id = created_company_id
        role = "owner"
    else:
        company = await database.companies.find_one({"invite_code": invite_code})
        if company is None:
            raise HTTPException(status_code=422, detail="Code d'invitation invalide.")
        company_id = company["_id"]
        role = "member"

    user = {
        "company_id": company_id,
        "display_name": payload.display_name.strip(),
        "email": str(payload.email).strip().lower(),
        "password_hash": password_hash.hash(payload.password),
        "role": role,
        "created_at": datetime.now(timezone.utc),
    }
    if len(user["display_name"]) < 2:
        if created_company_id is not None:
            await database.companies.delete_one({"_id": created_company_id})
        raise HTTPException(status_code=422, detail="Le nom doit contenir au moins 2 caractères.")

    try:
        user["_id"] = (await database.users.insert_one(user)).inserted_id
    except DuplicateKeyError:
        if created_company_id is not None:
            await database.companies.delete_one({"_id": created_company_id})
        raise HTTPException(status_code=409, detail="Cette adresse email est déjà utilisée.") from None

    if created_company_id is not None:
        await database.companies.update_one(
            {"_id": created_company_id}, {"$set": {"owner_id": user["_id"]}}
        )
    company = await database.companies.find_one({"_id": company_id})
    set_session_cookie(response, user)
    return {
        "user": serialize_user(user),
        "company": serialize_company(company, include_invite_code=True),
    }


@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    email = str(payload.email).strip().lower()
    user = await request.app.state.database.users.find_one({"email": email})
    if user is None or not password_hash.verify(payload.password, user["password_hash"]):
        raise unauthorized()
    company = await request.app.state.database.companies.find_one(
        {"_id": user["company_id"]}
    )
    if company is None:
        raise unauthorized()
    set_session_cookie(response, user)
    return {
        "user": serialize_user(user),
        "company": serialize_company(company, include_invite_code=True),
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, _user: dict = Depends(get_current_user)):
    response.delete_cookie(key=SESSION_COOKIE, path="/api", samesite="strict")


@router.get("/me")
async def current_session(
    request: Request,
    user: dict = Depends(get_current_user),
):
    company = await request.app.state.database.companies.find_one(
        {"_id": user["company_id"]}
    )
    if company is None:
        raise unauthorized()
    return {
        "user": serialize_user(user),
        "company": serialize_company(company, include_invite_code=True),
    }