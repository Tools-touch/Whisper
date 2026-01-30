from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class MessageIn(BaseModel):
    handle: str = Field(..., min_length=1, max_length=32)
    ciphertext: str
    nonce: str
    epk: str
    nickname: Optional[str] = None


class MessageOut(BaseModel):
    id: int
    handle: str
    ciphertext: str
    nonce: str
    epk: str
    nickname: Optional[str]
    created_at: str


class ChallengeOut(BaseModel):
    nonce: str
    message: str
    expires_at: int


class InboxRequest(BaseModel):
    handle: str
    pubkey: str
    signature: str
    nonce: str


class InboxResponse(BaseModel):
    messages: List[MessageOut]


class ProfileOut(BaseModel):
    handle: str
    owner: str
    enc_pk: str
    allowlist: List[str]


class ProfileSummary(BaseModel):
    handle: str
    owner: str
    enc_pk: str
    pda: str


class OwnerProfilesOut(BaseModel):
    profiles: List[ProfileSummary]
