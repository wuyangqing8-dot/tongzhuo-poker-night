import type { AuthenticatedUser } from "./poker-types";
import { isLocalRequest, LOCAL_DEMO_USER } from "./local-auth";
import { parseCookieValue, SESSION_COOKIE } from "./session-auth";

const idHeader = "oai-authenticated-user-id";
const emailHeader = "oai-authenticated-user-email";
const nameHeader = "oai-authenticated-user-full-name";
const encodingHeader = "oai-authenticated-user-full-name-encoding";

// Resolves the acting user for API routes. Precedence:
//   1. A valid session cookie (email + password accounts created on this site).
//   2. The ChatGPT / platform identity headers (production hosting).
//   3. The local demo identity, but only for loopback requests.
export async function getRequestUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    try {
      const { loadUserBySession } = await import("./poker-store");
      const sessionUser = await loadUserBySession(token);
      if (sessionUser) return sessionUser;
    } catch {
      // Session store unavailable; fall through to header / demo resolution.
    }
  }

  const id = request.headers.get(idHeader);
  const email = request.headers.get(emailHeader);
  if (!id || !email) {
    if (!isLocalRequest(request)) return null;
    return { ...LOCAL_DEMO_USER };
  }
  const encodedName = request.headers.get(nameHeader);
  let displayName = email.split("@")[0] || "牌友";
  if (encodedName && request.headers.get(encodingHeader) === "percent-encoded-utf-8") {
    try {
      displayName = decodeURIComponent(encodedName);
    } catch {
      /* keep the email fallback */
    }
  }
  return { id, email, displayName: displayName.slice(0, 28) };
}

export function unauthorized() {
  return Response.json({ error: "请先登录后再继续" }, { status: 401 });
}
