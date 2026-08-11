import type { AuthenticatedUser } from "../../../../lib/poker-types";
import {
  createCredential,
  createSession,
  createUserRecord,
  findCredentialByEmail,
  randomToken,
} from "../../../../lib/poker-store";
import {
  hashPassword,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookieAttributes,
  isSecureRequest,
} from "../../../../lib/session-auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let payload: { email?: unknown; password?: unknown; displayName?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const displayName =
    String(payload.displayName ?? "").trim().slice(0, 28) || email.split("@")[0] || "牌友";

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  }
  if (password.length < 6) {
    return Response.json({ error: "密码至少需要 6 位" }, { status: 400 });
  }

  try {
    const existing = await findCredentialByEmail(email);
    if (existing) {
      return Response.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    }

    const id = `user_${randomToken(12)}`;
    await createUserRecord(id, email, displayName);
    await createCredential(id, email, await hashPassword(password));
    const token = await createSession(id);

    const secure = isSecureRequest(request);
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; ${sessionCookieAttributes(secure, Math.floor(SESSION_TTL_MS / 1000))}`,
    );

    const user: AuthenticatedUser = { id, email, displayName };
    return Response.json({ user }, { status: 201, headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "注册失败，请稍后重试" },
      { status: 500 },
    );
  }
}
