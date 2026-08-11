import { getPlayerProfile } from "../../../lib/poker-store";
import { getRequestUser, unauthorized } from "../../../lib/request-auth";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();
  try {
    return Response.json({ profile: await getPlayerProfile(user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取个人战绩失败" }, { status: 500 });
  }
}
