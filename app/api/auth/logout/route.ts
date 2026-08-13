import { deleteSession } from "../../../../lib/poker-store";
import {
  parseCookieValue,
  SESSION_COOKIE,
  sessionCookieAttributes,
  isSecureRequest,
} from "../../../../lib/session-auth";

function clearCookieHeaders(request: Request): Headers {
  const secure = isSecureRequest(request);
  const headers = new Headers();
  headers.append("Set-Cookie", `${SESSION_COOKIE}=; ${sessionCookieAttributes(secure, 0)}`);
  return headers;
}

export async function POST(request: Request) {
  const token = parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    try {
      await deleteSession(token);
    } catch {
      /* best effort */
    }
  }
  return Response.json({ ok: true }, { headers: clearCookieHeaders(request) });
}

export async function GET(request: Request) {
  const token = parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    try {
      await deleteSession(token);
    } catch {
      /* best effort */
    }
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to") ?? "/";
  const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const target = new URL(safeReturn, url.origin);

  const headers = clearCookieHeaders(request);
  headers.set("Location", target.toString());
  return new Response(null, { status: 302, headers });
}
