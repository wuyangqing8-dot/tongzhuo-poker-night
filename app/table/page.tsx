import { requireChatGPTUser } from "../chatgpt-auth";
import PokerClient from "../poker-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ room?: string }>;
};

export default async function TablePage({ searchParams }: PageProps) {
  const { room } = await searchParams;
  const normalizedRoom = room?.trim().toUpperCase().slice(0, 20);
  const returnTo = normalizedRoom ? `/table?room=${encodeURIComponent(normalizedRoom)}` : "/table";
  const user = await requireChatGPTUser(returnTo);

  return <PokerClient initialRoomCode={normalizedRoom} user={{ id: user.userId, email: user.email, displayName: user.displayName }} />;
}
