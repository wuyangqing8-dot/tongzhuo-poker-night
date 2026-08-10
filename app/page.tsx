import { requireChatGPTUser } from "./chatgpt-auth";
import PokerClient from "./poker-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ room?: string }>;
};

async function AuthenticatedTable({ room }: { room?: string }) {
  const returnTo = room ? `/?room=${encodeURIComponent(room)}` : "/";
  const user = await requireChatGPTUser(returnTo);
  return (
    <PokerClient
      initialRoomCode={room}
      user={{ id: user.userId, email: user.email, displayName: user.displayName }}
    />
  );
}

export default async function Home({ searchParams }: PageProps) {
  const { room } = await searchParams;
  return <AuthenticatedTable room={room} />;
}
