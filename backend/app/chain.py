from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import List, Optional, Tuple

import httpx
from solders.pubkey import Pubkey

PROGRAM_ID = Pubkey.from_string(
    os.getenv("PROGRAM_ID", "D4vno1rrteswpFM3SSfzvJwyPzSkQKCiN6WfEuK7qGyS")
)
RPC_URL = os.getenv("RPC_URL", "https://api.devnet.solana.com")


class RpcError(Exception):
    pass


@dataclass
class ProfileOnchain:
    owner: Pubkey
    handle: str
    enc_pk: bytes
    allowlist: List[Pubkey]
    bump: int


def derive_profile_pda(handle: str) -> Pubkey:
    return Pubkey.find_program_address(
        [b"profile", handle.encode("utf-8")], PROGRAM_ID
    )[0]


def parse_profile(data: bytes) -> ProfileOnchain:
    # Anchor account layout (borsh): 8 discriminator + fields
    idx = 8
    owner = Pubkey.from_bytes(data[idx : idx + 32])
    idx += 32

    handle_len = int.from_bytes(data[idx : idx + 4], "little")
    idx += 4
    handle = data[idx : idx + handle_len].decode("utf-8")
    idx += handle_len

    enc_pk = data[idx : idx + 32]
    idx += 32

    allow_len = int.from_bytes(data[idx : idx + 4], "little")
    idx += 4
    allowlist = []
    for _ in range(allow_len):
        allowlist.append(Pubkey.from_bytes(data[idx : idx + 32]))
        idx += 32

    bump = data[idx] if idx < len(data) else 0
    return ProfileOnchain(
        owner=owner,
        handle=handle,
        enc_pk=enc_pk,
        allowlist=allowlist,
        bump=bump,
    )


async def fetch_profile(handle: str) -> Optional[ProfileOnchain]:
    pda = derive_profile_pda(handle)
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getAccountInfo",
        "params": [str(pda), {"encoding": "base64"}],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
            resp = await client.post(RPC_URL, json=payload)
            resp.raise_for_status()
            result = resp.json().get("result", {})
            value = result.get("value")
            if not value:
                return None
            data_b64 = value.get("data", [None])[0]
            if not data_b64:
                return None
    except httpx.HTTPError as exc:
        raise RpcError("RPC request failed") from exc

    raw = base64.b64decode(data_b64)
    return parse_profile(raw)


async def fetch_profiles_by_owner(owner_pubkey: str) -> List[Tuple[Pubkey, ProfileOnchain]]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getProgramAccounts",
        "params": [
            str(PROGRAM_ID),
            {
                "encoding": "base64",
                "filters": [
                    {"memcmp": {"offset": 8, "bytes": owner_pubkey}},
                ],
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
            resp = await client.post(RPC_URL, json=payload)
            resp.raise_for_status()
            result = resp.json().get("result", [])
    except httpx.HTTPError as exc:
        raise RpcError("RPC request failed") from exc

    profiles: List[Tuple[Pubkey, ProfileOnchain]] = []
    for item in result:
        data_b64 = item.get("account", {}).get("data", [None])[0]
        if not data_b64:
            continue
        raw = base64.b64decode(data_b64)
        profile = parse_profile(raw)
        profiles.append((Pubkey.from_string(item["pubkey"]), profile))
    return profiles


def is_allowed(profile: ProfileOnchain, viewer_pubkey: str) -> bool:
    if str(profile.owner) == viewer_pubkey:
        return True
    return any(str(pk) == viewer_pubkey for pk in profile.allowlist)
