import type { AuthenticatedUser } from "../../../../lib/poker-types";
import {
  createSession,
  findCredentialByEmail,
  loadUserById,
} from "../../../../lib/poker-store";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookieAttributes,
  verifyPassword,
  isSecureRequest,
} from "../../../../lib/session-auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ERROR = "邮箱或密码不正确";

export async function POST(request: Request) {
  let payload: { email?: unknown; password?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");

  if (!EMAIL_RE.test(email) || !password) {
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  try {
    const credential = await findCredentialByEmail(email);
    if (!credential) {
      return Response.json({ error: GENERIC_ERROR }, { status: 401 });
    }
    const ok = await verifyPassword(password, credential.passwordHash);
    if (!ok) {
      return Response.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const user = await loadUserById(credential.userId);
    if (!user) {
      return Response.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const token = await createSession(user.id);
    const secure = isSecureRequest(request);
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; ${sessionCookieAttributes(secure, Math.floor(SESSION_TTL_MS / 1000))}`,
    );

    const safeUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    };
    return Response.json({ user: safeUser }, { status: 200, headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "登录失败，请稍后重试" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({ error: "请使用 POST 登录" }, { status: 405 });
}
