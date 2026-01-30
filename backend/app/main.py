import base64
import secrets
import time
from typing import Dict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from . import chain, crypto, db  # noqa: E402
from .models import (
    ChallengeOut,
    InboxRequest,
    InboxResponse,
    MessageIn,
    OwnerProfilesOut,
    ProfileOut,
    ProfileSummary,
)

app = FastAPI(title="SolanaDemo Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

CHALLENGE_TTL_SECONDS = 300
CHALLENGES: Dict[str, Dict[str, str | int]] = {}


def _cleanup_challenges() -> None:
    now = int(time.time())
    expired = [nonce for nonce, v in CHALLENGES.items() if v["expires_at"] < now]
    for nonce in expired:
        CHALLENGES.pop(nonce, None)


def _challenge_message(handle: str, nonce: str) -> str:
    return f"blueshift-inbox:{handle}:{nonce}"


@app.on_event("startup")
def on_startup() -> None:
    db.init_db()


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/challenge", response_model=ChallengeOut)
async def get_challenge(handle: str = Query(..., min_length=1, max_length=32)) -> ChallengeOut:
    _cleanup_challenges()
    nonce = secrets.token_urlsafe(16)
    message = _challenge_message(handle, nonce)
    expires_at = int(time.time()) + CHALLENGE_TTL_SECONDS
    CHALLENGES[nonce] = {"handle": handle, "message": message, "expires_at": expires_at}
    return ChallengeOut(nonce=nonce, message=message, expires_at=expires_at)


@app.post("/message")
def post_message(payload: MessageIn) -> dict:
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    db.insert_message(payload, created_at)
    return {"ok": True}


@app.get("/profile/{handle}", response_model=ProfileOut)
async def get_profile(
    handle: str = Path(..., min_length=1, max_length=32)
) -> ProfileOut:
    try:
        profile = await chain.fetch_profile(handle)
    except chain.RpcError:
        raise HTTPException(status_code=502, detail="RPC unavailable")
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return ProfileOut(
        handle=profile.handle,
        owner=str(profile.owner),
        enc_pk=base64.b64encode(profile.enc_pk).decode("utf-8"),
        allowlist=[str(pk) for pk in profile.allowlist],
    )


@app.get("/profiles/owner/{pubkey}", response_model=OwnerProfilesOut)
async def get_profiles_by_owner(pubkey: str) -> OwnerProfilesOut:
    try:
        profiles = await chain.fetch_profiles_by_owner(pubkey)
    except chain.RpcError:
        raise HTTPException(status_code=502, detail="RPC unavailable")
    return OwnerProfilesOut(
        profiles=[
            ProfileSummary(
                handle=profile.handle,
                owner=str(profile.owner),
                enc_pk=base64.b64encode(profile.enc_pk).decode("utf-8"),
                pda=str(pda),
            )
            for pda, profile in profiles
        ]
    )


@app.post("/inbox", response_model=InboxResponse)
async def get_inbox(payload: InboxRequest) -> InboxResponse:
    _cleanup_challenges()
    challenge = CHALLENGES.get(payload.nonce)
    if not challenge or challenge["handle"] != payload.handle:
        raise HTTPException(status_code=400, detail="Invalid challenge")

    message = challenge["message"].encode("utf-8")
    if not crypto.verify_signature(payload.pubkey, payload.signature, message):
        raise HTTPException(status_code=401, detail="Signature verification failed")

    try:
        profile = await chain.fetch_profile(payload.handle)
    except chain.RpcError:
        raise HTTPException(status_code=502, detail="RPC unavailable")
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not chain.is_allowed(profile, payload.pubkey):
        raise HTTPException(status_code=403, detail="Not in allowlist")

    CHALLENGES.pop(payload.nonce, None)
    messages = db.fetch_messages(payload.handle)
    return InboxResponse(messages=messages)
