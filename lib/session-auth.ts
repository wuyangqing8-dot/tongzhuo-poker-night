// Self-contained auth primitives for 同桌 Poker Night.
//
// Passwords are hashed with PBKDF2-HMAC-SHA256 via the Web Crypto API, which is
// available on Cloudflare Workers, Miniflare (local dev) and modern Node runtimes.
// This module is intentionally free of any database import so it can be used from
// request helpers, tests and server components without pulling in the Workers runtime.

export const SESSION_COOKIE = "pn_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // Cloudflare Workers' Web Crypto (crypto.subtle) hard-caps PBKDF2 iterations at
  // 100_000. Anything higher throws at runtime, which is why registration 500s in
  // production while passing locally on Node/Miniflare. Do not raise this above 100_000.
  const iterations = 100_000;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const derived = new Uint8Array(bits);
  return `pbkdf2$sha256$${iterations}$${toHex(salt)}$${toHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = fromHex(parts[3]);
  const expected = fromHex(parts[4]);
  const enc = new TextEncoder();
  let keyMaterial: CryptoKey;
  try {
    keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password) as BufferSource, "PBKDF2", false, [
      "deriveBits",
    ]);
  } catch {
    return false;
  }
  let derived: Uint8Array;
  try {
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
      keyMaterial,
      256,
    );
    derived = new Uint8Array(bits);
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i += 1) diff |= derived[i] ^ expected[i];
  return diff === 0;
}

export function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === name) return decodeURIComponent(value);
  }
  return null;
}

export function sessionCookieAttributes(secure: boolean, maxAgeSeconds: number): string {
  const parts = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// Detects whether the request was actually served over HTTPS.
//
// Deployment platforms (Cloudflare, Codex/OpenAI hosting, and most CDNs)
// terminate TLS at the edge and forward plain HTTP to the Worker, so trusting
// `request.url.protocol` alone returns false on a public HTTPS site. That would
// make us drop the `Secure` flag on the session cookie, weakening it and
// breaking logins behind certain proxies. We trust the `x-forwarded-proto`
// header first, then fall back to the URL protocol.
export function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) {
    const value = proto.split(",")[0]?.trim().toLowerCase();
    if (value === "https" || value === "on" || value === "1") return true;
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}
