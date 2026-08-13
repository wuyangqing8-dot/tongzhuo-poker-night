export const LOCAL_DEMO_USER = {
  id: "local-demo-user",
  email: "local@pokernight.test",
  displayName: "本地房主",
} as const;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLocalHost(value: string | null | undefined): boolean {
  if (!value) return false;

  const normalized = value.split(",", 1)[0]?.trim().toLowerCase();
  if (!normalized) return false;

  try {
    const hostname = new URL(`http://${normalized}`).hostname;
    return LOCAL_HOSTNAMES.has(hostname.replace(/^\[|\]$/g, ""));
  } catch {
    return false;
  }
}

export function isLocalRequest(request: Request): boolean {
  try {
    return LOCAL_HOSTNAMES.has(
      new URL(request.url).hostname.toLowerCase().replace(/^\[|\]$/g, ""),
    );
  } catch {
    return false;
  }
}
