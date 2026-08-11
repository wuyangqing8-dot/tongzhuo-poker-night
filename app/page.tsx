import AuthLanding from "./auth-landing";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ room?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const { room } = await searchParams;
  const normalizedRoom = room?.trim().toUpperCase().slice(0, 20);
  const tablePath = normalizedRoom ? `/table?room=${encodeURIComponent(normalizedRoom)}` : "/table";
  const user = await getChatGPTUser();

  return (
    <AuthLanding
      roomCode={normalizedRoom}
      signInPath={chatGPTSignInPath(tablePath)}
      tablePath={tablePath}
      user={user}
    />
  );
}
