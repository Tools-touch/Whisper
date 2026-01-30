export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function readError(res: Response) {
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") {
      return data.detail;
    }
    return JSON.stringify(data);
  } catch {
    return await res.text();
  }
}

export type ProfileOut = {
  handle: string;
  owner: string;
  enc_pk: string;
  allowlist: string[];
};

export type ChallengeOut = {
  nonce: string;
  message: string;
  expires_at: number;
};

export type MessageOut = {
  id: number;
  handle: string;
  ciphertext: string;
  nonce: string;
  epk: string;
  nickname?: string | null;
  created_at: string;
};

export type ProfileSummary = {
  handle: string;
  owner: string;
  enc_pk: string;
  pda: string;
};

export async function getProfile(handle: string): Promise<ProfileOut> {
  const res = await fetch(`${API_BASE}/profile/${handle}`);
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function getProfilesByOwner(
  pubkey: string
): Promise<{ profiles: ProfileSummary[] }> {
  const res = await fetch(`${API_BASE}/profiles/owner/${pubkey}`);
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function profileExists(handle: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/profile/${handle}`);
  if (res.status === 404) {
    return false;
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return true;
}

export async function postMessage(payload: {
  handle: string;
  ciphertext: string;
  nonce: string;
  epk: string;
  nickname?: string;
}) {
  const res = await fetch(`${API_BASE}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function getChallenge(handle: string): Promise<ChallengeOut> {
  const res = await fetch(`${API_BASE}/challenge?handle=${handle}`);
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}

export async function getInbox(payload: {
  handle: string;
  pubkey: string;
  signature: string;
  nonce: string;
}): Promise<{ messages: MessageOut[] }> {
  const res = await fetch(`${API_BASE}/inbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json();
}
