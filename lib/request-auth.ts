import type { AuthenticatedUser } from "./poker-types";

const idHeader = "oai-authenticated-user-id";
const emailHeader = "oai-authenticated-user-email";
const nameHeader = "oai-authenticated-user-full-name";
const encodingHeader = "oai-authenticated-user-full-name-encoding";

export function getRequestUser(request: Request): AuthenticatedUser | null {
  const id = request.headers.get(idHeader);
  const email = request.headers.get(emailHeader);
  if (!id || !email) return null;
  const encodedName = request.headers.get(nameHeader);
  let displayName = email.split("@")[0] || "牌友";
  if (encodedName && request.headers.get(encodingHeader) === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName); } catch { /* keep the email fallback */ }
  }
  return { id, email, displayName: displayName.slice(0, 28) };
}

export function unauthorized() {
  return Response.json({ error: "请先使用 ChatGPT 登录" }, { status: 401 });
}
