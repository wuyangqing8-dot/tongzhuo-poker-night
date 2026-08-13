import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "../../lib/session-auth";
import LoginClient from "./login-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ room?: string; return_to?: string; mode?: string }>;
};

function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { room, return_to, mode } = await searchParams;
  const normalizedRoom = room?.trim().toUpperCase().slice(0, 20) || null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const target = safeReturnTo(return_to) ?? (normalizedRoom ? `/table?room=${normalizedRoom}` : "/table");
    redirect(target);
  }

  const returnTo =
    safeReturnTo(return_to) ??
    (normalizedRoom ? `/table?room=${encodeURIComponent(normalizedRoom)}` : "/table");

  return (
    <LoginClient
      initialMode={mode === "register" ? "register" : "login"}
      returnTo={returnTo}
      roomCode={normalizedRoom ?? undefined}
    />
  );
}
