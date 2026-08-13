import { env } from "cloudflare:workers";
import { SESSION_TTL_MS } from "./session-auth";
import type { AuthenticatedUser, PokerGameState } from "./poker-types";
import type { PlayerProfile, ProfileHandResult, ProfileRoomSummary } from "./profile-types";

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
      database.prepare(`CREATE TABLE IF NOT EXISTS hand_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        room_id TEXT NOT NULL,
        room_code TEXT NOT NULL,
        room_name TEXT NOT NULL,
        room_mode TEXT NOT NULL,
        hand_number INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        net INTEGER NOT NULL,
        ending_chips INTEGER NOT NULL,
        won INTEGER NOT NULL,
        result_text TEXT NOT NULL,
        completed_at INTEGER NOT NULL
      )`),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms(updated_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_room_members_user_updated ON room_members(user_id, updated_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_game_actions_room_id ON game_actions(room_id, id)"),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_hand_results_unique_player_hand ON hand_results(room_id, hand_number, user_id)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_hand_results_user_completed ON hand_results(user_id, completed_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_hand_results_room_hand ON hand_results(room_id, hand_number)"),
      database.prepare(`CREATE TABLE IF NOT EXISTS user_credentials (
        user_id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_credentials_email ON user_credentials(email)"),
      database.prepare(`CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`),
      database.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"),
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

export async function createUserRecord(id: string, email: string, displayName: string) {
  await ensurePokerSchema();
  const now = Date.now();
  await db().prepare(`INSERT INTO users (id, email, display_name, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, email, displayName, now, now).run();
}

export async function loadUserById(userId: string): Promise<AuthenticatedUser | null> {
  await ensurePokerSchema();
  const row = await db().prepare("SELECT id, email, display_name FROM users WHERE id = ? LIMIT 1")
    .bind(userId).first<{ id: string; email: string; display_name: string }>();
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export async function findCredentialByEmail(email: string): Promise<{ userId: string; passwordHash: string } | null> {
  await ensurePokerSchema();
  const row = await db().prepare("SELECT user_id, password_hash FROM user_credentials WHERE email = ? LIMIT 1")
    .bind(email).first<{ user_id: string; password_hash: string }>();
  if (!row) return null;
  return { userId: row.user_id, passwordHash: row.password_hash };
}

export async function createCredential(userId: string, email: string, passwordHash: string) {
  await ensurePokerSchema();
  const now = Date.now();
  await db().prepare(`INSERT INTO user_credentials (user_id, email, password_hash, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      password_hash = excluded.password_hash,
      updated_at = excluded.updated_at`)
    .bind(userId, email, passwordHash, now).run();
}

export async function createSession(userId: string): Promise<string> {
  await ensurePokerSchema();
  const token = randomToken(24);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await db().prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)`)
    .bind(token, userId, now, expiresAt).run();
  return token;
}

export async function loadUserBySession(token: string): Promise<AuthenticatedUser | null> {
  await ensurePokerSchema();
  const row = await db().prepare(`SELECT s.user_id AS user_id, s.expires_at AS expires_at,
      u.email AS email, u.display_name AS display_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? LIMIT 1`)
    .bind(token).first<{ user_id: string; expires_at: number; email: string; display_name: string }>();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await db().prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { id: row.user_id, email: row.email, displayName: row.display_name };
}

export async function deleteSession(token: string) {
  await db().prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
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

export async function recordCompletedHand(state: PokerGameState) {
  if (state.phase !== "showdown" || state.handNumber <= 0) return;
  await ensurePokerSchema();
  const outcomes = state.lastHandResults ?? state.players
    .filter((player) => player.hole.length === 2)
    .map((player) => ({
      playerId: player.id,
      playerName: player.name,
      chipsBefore: player.handStartChips ?? player.chips,
      chipsAfter: player.chips,
      net: player.chips - (player.handStartChips ?? player.chips),
      won: false,
    }));
  const humanOutcomes = outcomes.filter((outcome) => {
    const player = state.players.find((item) => item.id === outcome.playerId);
    return player && !player.isBot;
  });
  if (!humanOutcomes.length) return;
  const completedAt = state.updatedAt || Date.now();
  await db().batch(humanOutcomes.map((outcome) => db().prepare(`INSERT INTO hand_results
    (room_id, room_code, room_name, room_mode, hand_number, user_id, player_name, net, ending_chips, won, result_text, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_id, hand_number, user_id) DO NOTHING`)
    .bind(
      state.roomId,
      state.roomCode,
      state.roomName,
      state.roomMode ?? "classic",
      state.handNumber,
      outcome.playerId,
      outcome.playerName,
      outcome.net,
      outcome.chipsAfter,
      outcome.won ? 1 : 0,
      state.resultText || `Hand #${state.handNumber} 结束`,
      completedAt,
    )));
}

type ProfileAggregateRow = {
  total_hands: number;
  wins: number;
  total_net: number;
  best_hand: number;
  worst_hand: number;
  rooms: number;
  biggest_ending_stack: number;
};

type ProfileHandRow = {
  id: number;
  room_id: string;
  room_code: string;
  room_name: string;
  room_mode: string;
  hand_number: number;
  net: number;
  ending_chips: number;
  won: number;
  result_text: string;
  completed_at: number;
};

type ProfileRoomRow = {
  room_id: string;
  room_code: string;
  room_name: string;
  room_mode: string;
  hands: number;
  wins: number;
  net: number;
  ending_chips: number;
  last_played_at: number;
};

export async function getPlayerProfile(user: AuthenticatedUser): Promise<PlayerProfile> {
  await upsertUser(user);
  const database = db();
  const [aggregate, recentResult, roomResult, userRow] = await Promise.all([
    database.prepare(`SELECT
      COUNT(*) AS total_hands,
      COALESCE(SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(net), 0) AS total_net,
      COALESCE(MAX(net), 0) AS best_hand,
      COALESCE(MIN(net), 0) AS worst_hand,
      COUNT(DISTINCT room_id) AS rooms,
      COALESCE(MAX(ending_chips), 0) AS biggest_ending_stack
      FROM hand_results WHERE user_id = ?`).bind(user.id).first<ProfileAggregateRow>(),
    database.prepare(`SELECT id, room_id, room_code, room_name, room_mode, hand_number, net,
      ending_chips, won, result_text, completed_at
      FROM hand_results WHERE user_id = ? ORDER BY completed_at DESC, id DESC LIMIT 30`)
      .bind(user.id).all<ProfileHandRow>(),
    database.prepare(`SELECT room_id, MAX(room_code) AS room_code, MAX(room_name) AS room_name,
      MAX(room_mode) AS room_mode, COUNT(*) AS hands,
      SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) AS wins, SUM(net) AS net,
      MAX(ending_chips) AS ending_chips, MAX(completed_at) AS last_played_at
      FROM hand_results WHERE user_id = ? GROUP BY room_id ORDER BY last_played_at DESC LIMIT 12`)
      .bind(user.id).all<ProfileRoomRow>(),
    database.prepare("SELECT created_at FROM users WHERE id = ? LIMIT 1").bind(user.id).first<{ created_at: number }>(),
  ]);
  const recentHands: ProfileHandResult[] = (recentResult.results ?? []).map((row) => ({
    id: row.id,
    roomId: row.room_id,
    roomCode: row.room_code,
    roomName: row.room_name,
    roomMode: row.room_mode === "party" ? "party" : "classic",
    handNumber: row.hand_number,
    net: row.net,
    endingChips: row.ending_chips,
    won: Boolean(row.won),
    resultText: row.result_text,
    completedAt: row.completed_at,
  }));
  const rooms: ProfileRoomSummary[] = (roomResult.results ?? []).map((row) => ({
    roomId: row.room_id,
    roomCode: row.room_code,
    roomName: row.room_name,
    roomMode: row.room_mode === "party" ? "party" : "classic",
    hands: row.hands,
    wins: row.wins,
    net: row.net,
    endingChips: row.ending_chips,
    lastPlayedAt: row.last_played_at,
  }));
  let currentWinStreak = 0;
  for (const hand of recentHands) {
    if (!hand.won) break;
    currentWinStreak += 1;
  }
  const totalHands = aggregate?.total_hands ?? 0;
  const wins = aggregate?.wins ?? 0;
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: userRow?.created_at ?? Date.now() },
    summary: {
      totalHands,
      wins,
      winRate: totalHands ? Math.round((wins / totalHands) * 1000) / 10 : 0,
      totalNet: aggregate?.total_net ?? 0,
      bestHand: aggregate?.best_hand ?? 0,
      worstHand: aggregate?.worst_hand ?? 0,
      rooms: aggregate?.rooms ?? 0,
      biggestEndingStack: aggregate?.biggest_ending_stack ?? 0,
      currentWinStreak,
    },
    recentHands,
    rooms,
  };
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
