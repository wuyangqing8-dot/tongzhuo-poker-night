import { addHumanPlayer, createInitialState, toPublicView } from "../../../lib/poker-engine";
import { getRequestUser, unauthorized } from "../../../lib/request-auth";
import {
  addRoomMember,
  createRoomRecord,
  ensurePokerSchema,
  findRoomByCode,
  randomToken,
  saveState,
  uniqueRoomCode,
  upsertUser,
} from "../../../lib/poker-store";

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();

  try {
    await ensurePokerSchema();
    await upsertUser(user);
    const payload = await request.json() as {
      mode?: "create" | "join";
      code?: string;
      name?: string;
      maxPlayers?: number;
      startingChips?: number;
      bigBlind?: number;
      bots?: number;
    };

    if (payload.mode === "join") {
      const code = payload.code?.trim().toUpperCase() ?? "";
      if (!code) return Response.json({ error: "请输入房间码" }, { status: 400 });
      const room = await findRoomByCode(code);
      if (!room) return Response.json({ error: "没有找到这个房间" }, { status: 404 });
      addHumanPlayer(room.state, user);
      await saveState(room.state, room.version);
      await addRoomMember(room.state, user);
      return Response.json({ game: toPublicView(room.state, user.id) });
    }

    const maxPlayers = Math.max(2, Math.min(6, Number(payload.maxPlayers) || 6));
    const startingChips = Math.max(1000, Math.min(100000, Number(payload.startingChips) || 5000));
    const bigBlind = Math.max(10, Math.min(1000, Number(payload.bigBlind) || 40));
    const bots = Math.max(0, Math.min(maxPlayers - 1, Number(payload.bots) || 0));
    const code = await uniqueRoomCode();
    const state = createInitialState({
      roomId: `room_${randomToken(10)}`,
      code,
      name: (payload.name?.trim() || "同学牌局").slice(0, 24),
      ownerId: user.id,
      ownerName: user.displayName,
      ownerEmail: user.email,
      maxPlayers,
      startingChips,
      smallBlind: Math.max(5, Math.floor(bigBlind / 2)),
      bigBlind,
      bots,
    });
    await createRoomRecord(state, user);
    return Response.json({ game: toPublicView(state, user.id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建房间失败";
    const status = message === "STATE_CONFLICT" ? 409 : 500;
    return Response.json({ error: status === 409 ? "房间刚刚发生变化，请重试" : message }, { status });
  }
}
