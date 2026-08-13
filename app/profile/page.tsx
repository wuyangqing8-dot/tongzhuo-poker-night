import { requireChatGPTUser } from "../chatgpt-auth";
import ProfileClient from "./profile-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireChatGPTUser("/profile");
  return <ProfileClient user={{ id: user.userId, email: user.email, displayName: user.displayName }} />;
}
