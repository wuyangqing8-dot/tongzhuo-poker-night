import { env } from "cloudflare:workers";
import type { AuthenticatedUser, PokerGameState } from "./poker-types";

type RoomRow = {
  id: string;
  code: string;
  state_json: string;
  version: number;
};

let schemaReady: Promise<void> | null = null;

function db() {
  if (!env.DB) throw new Error("牌局数据库暂不可用");
  return env.DB;
}

export async function ensurePokerSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const database = db();
    await database.batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        max_players INTEGER NOT NULL,
        small_blind INTEGER NOT NULL,
        big_blind INTEGER NOT NULL,
        starting_chips INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        seat INTEGER NOT NULL,
        joined_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(room_id, user_id)
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS game_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        room_id TEXT NOT NULL,
        hand_number INTEGER NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        amount INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER NOT NULL
      )`),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms(updated_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_room_members_user_updated ON room_members(user_id, updated_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_game_actions_room_id ON game_actions(room_id, id)"),
    ]);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function upsertUser(user: AuthenticatedUser) {
  await ensurePokerSchema();
  const now = Date.now();
  await db().prepare(`INSERT INTO users (id, email, display_name, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      last_seen_at = excluded.last_seen_at`)
    .bind(user.id, user.email, user.displayName, now, now).run();
}

function parseRoom(row: RoomRow | null) {
  if (!row) return null;
  const state = JSON.parse(row.state_json) as PokerGameState;
  state.version = row.version;
  return { state, version: row.version };
}

export async function findRoomByCode(code: string) {
  await ensurePokerSchema();
  const row = await db().prepare("SELECT id, code, state_json, version FROM rooms WHERE code = ? LIMIT 1")
    .bind(code.toUpperCase()).first<RoomRow>();
  return parseRoom(row);
}

export async function findRecentRoomForUser(userId: string) {
  await ensurePokerSchema();
  const row = await db().prepare(`SELECT r.id, r.code, r.state_json, r.version
    FROM room_members m
    JOIN rooms r ON r.id = m.room_id
    WHERE m.user_id = ?
    ORDER BY m.updated_at DESC
    LIMIT 1`).bind(userId).first<RoomRow>();
  return parseRoom(row);
}

export async function createRoomRecord(state: PokerGameState, user: AuthenticatedUser) {
  await ensurePokerSchema();
  const now = Date.now();
  await db().batch([
    db().prepare(`INSERT INTO rooms
      (id, code, name, owner_id, max_players, small_blind, big_blind, starting_chips, state_json, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        state.roomId,
        state.roomCode,
        state.roomName,
        state.ownerId,
        state.maxPlayers,
        state.smallBlind,
        state.bigBlind,
        state.startingChips,
        JSON.stringify(state),
        state.version,
        now,
        now,
      ),
    db().prepare(`INSERT INTO room_members (room_id, user_id, seat, joined_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(state.roomId, user.id, 0, now, now),
  ]);
}

export async function saveState(state: PokerGameState, expectedVersion: number) {
  const nextVersion = expectedVersion + 1;
  state.version = nextVersion;
  state.updatedAt = Date.now();
  const result = await db().prepare(`UPDATE rooms
    SET state_json = ?, version = ?, updated_at = ?
    WHERE id = ? AND version = ?`)
    .bind(JSON.stringify(state), nextVersion, state.updatedAt, state.roomId, expectedVersion)
    .run();
  if ((result.meta?.changes ?? 0) !== 1) throw new Error("STATE_CONFLICT");
  return nextVersion;
}

export async function addRoomMember(state: PokerGameState, user: AuthenticatedUser) {
  const player = state.players.find((item) => item.id === user.id);
  if (!player) throw new Error("玩家未入座");
  const now = Date.now();
  await db().prepare(`INSERT INTO room_members (room_id, user_id, seat, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(room_id, user_id) DO UPDATE SET seat = excluded.seat, updated_at = excluded.updated_at`)
    .bind(state.roomId, user.id, player.seat, now, now).run();
}

export async function touchMembership(roomId: string, userId: string) {
  await db().prepare("UPDATE room_members SET updated_at = ? WHERE room_id = ? AND user_id = ?")
    .bind(Date.now(), roomId, userId).run();
}

export async function removeRoomMember(roomId: string, userId: string) {
  await db().prepare("DELETE FROM room_members WHERE room_id = ? AND user_id = ?")
    .bind(roomId, userId).run();
}

export async function recordAction(state: PokerGameState, actorId: string, action: string, amount = 0) {
  await db().prepare(`INSERT INTO game_actions (room_id, hand_number, actor_id, action, amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(state.roomId, state.handNumber, actorId, action, amount, Date.now()).run();
}

export function randomToken(bytes = 12) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function uniqueRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const suffix = [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
    const code = `TONG-${suffix}`;
    const exists = await db().prepare("SELECT 1 AS found FROM rooms WHERE code = ? LIMIT 1").bind(code).first();
    if (!exists) return code;
  }
  throw new Error("暂时无法生成房间码，请重试");
}
