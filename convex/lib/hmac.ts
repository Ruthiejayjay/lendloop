const encoder = new TextEncoder();
const MAX_SKEW_SECONDS = 300; // 5-minute replay protection window

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signPayload(
  secret: string,
  timestamp: string,
  body: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`)
  );
  return toHex(signature);
}

export async function verifySignedRequest(params: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { secret, timestamp, signature, body } = params;
  if (!timestamp || !signature) {
    return { ok: false, reason: "Missing signature or timestamp header" };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: "Invalid timestamp header" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsNum) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "Request timestamp outside allowed window" };
  }

  const expected = await signPayload(secret, timestamp, body);
  const normalized = signature.replace(/^sha256=/i, "").trim().toLowerCase();

  if (!timingSafeEqualHex(expected, normalized)) {
    return { ok: false, reason: "Invalid HMAC signature" };
  }

  return { ok: true };
}