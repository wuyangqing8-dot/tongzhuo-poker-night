import { applyPlayerAction, maybeAdvanceGame, startHand, toPublicView } from "../../../lib/poker-engine";
import type { PlayerAction } from "../../../lib/poker-types";
import { getRequestUser, unauthorized } from "../../../lib/request-auth";
import {
  findRecentRoomForUser,
  findRoomByCode,
  recordAction,
  saveState,
  touchMembership,
  upsertUser,
} from "../../../lib/poker-store";

async function resolveRoom(userId: string, code?: string | null) {
  return code ? findRoomByCode(code.trim().toUpperCase()) : findRecentRoomForUser(userId);
}

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();
  try {
    await upsertUser(user);
    const code = new URL(request.url).searchParams.get("code");
    const room = await resolveRoom(user.id, code);
    if (!room) return Response.json({ needsRoom: true, user });
    const player = room.state.players.find((item) => item.id === user.id);
    if (!player) return Response.json({ needsJoin: true, code: room.state.roomCode, user });

    const previousUpdatedAt = room.state.updatedAt;
    if (Date.now() - player.lastSeenAt > 6_000) player.lastSeenAt = Date.now();
    maybeAdvanceGame(room.state);
    if (room.state.updatedAt !== previousUpdatedAt || Date.now() - player.lastSeenAt < 100) {
      try { await saveState(room.state, room.version); } catch (error) {
        if (!(error instanceof Error && error.message === "STATE_CONFLICT")) throw error;
        const fresh = await resolveRoom(user.id, code);
        if (fresh) return Response.json({ game: toPublicView(fresh.state, user.id), user });
      }
    }
    await touchMembership(room.state.roomId, user.id);
    return Response.json({ game: toPublicView(room.state, user.id), user });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取牌局失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return unauthorized();
  try {
    const payload = await request.json() as {
      code?: string;
      type?: "action" | "chat" | "start";
      action?: PlayerAction;
      amount?: number;
      message?: string;
    };
    const room = await resolveRoom(user.id, payload.code);
    if (!room) return Response.json({ error: "房间不存在" }, { status: 404 });
    const player = room.state.players.find((item) => item.id === user.id);
    if (!player) return Response.json({ error: "你还没有加入这个房间" }, { status: 403 });
    player.lastSeenAt = Date.now();

    if (payload.type === "chat") {
      const text = payload.message?.trim().slice(0, 120) ?? "";
      if (!text) return Response.json({ error: "消息不能为空" }, { status: 400 });
      room.state.chats.push({ id: `chat_${crypto.randomUUID()}`, userId: user.id, name: user.displayName, text, at: Date.now() });
      room.state.chats = room.state.chats.slice(-40);
      room.state.updatedAt = Date.now();
      await recordAction(room.state, user.id, "chat");
    } else if (payload.type === "start") {
      if (room.state.ownerId !== user.id) return Response.json({ error: "只有房主可以开始下一手" }, { status: 403 });
      if (room.state.phase !== "waiting" && room.state.phase !== "showdown") {
        return Response.json({ error: "当前牌局仍在进行" }, { status: 400 });
      }
      startHand(room.state);
      await recordAction(room.state, user.id, "start_hand");
    } else {
      const action = payload.action;
      if (!action || !["fold", "check", "call", "raise"].includes(action)) {
        return Response.json({ error: "无效操作" }, { status: 400 });
      }
      applyPlayerAction(room.state, user.id, action, payload.amount);
      await recordAction(room.state, user.id, action, payload.amount ?? 0);
    }

    await saveState(room.state, room.version);
    await touchMembership(room.state.roomId, user.id);
    return Response.json({ game: toPublicView(room.state, user.id), user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    const status = message === "STATE_CONFLICT" ? 409 : 400;
    return Response.json({ error: status === 409 ? "其他玩家刚刚完成操作，已为你同步最新状态" : message }, { status });
  }
}
