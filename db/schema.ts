import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ownerId: text("owner_id").notNull(),
    maxPlayers: integer("max_players").notNull(),
    smallBlind: integer("small_blind").notNull(),
    bigBlind: integer("big_blind").notNull(),
    startingChips: integer("starting_chips").notNull(),
    stateJson: text("state_json").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_rooms_code").on(table.code),
    index("idx_rooms_updated_at").on(table.updatedAt),
  ],
);

export const roomMembers = sqliteTable(
  "room_members",
  {
    roomId: text("room_id").notNull(),
    userId: text("user_id").notNull(),
    seat: integer("seat").notNull(),
    joinedAt: integer("joined_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId] }),
    index("idx_room_members_user_updated").on(table.userId, table.updatedAt),
  ],
);

export const gameActions = sqliteTable(
  "game_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id").notNull(),
    handNumber: integer("hand_number").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    amount: integer("amount").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_game_actions_room_id").on(table.roomId, table.id)],
);

export const handResults = sqliteTable(
  "hand_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id").notNull(),
    roomCode: text("room_code").notNull(),
    roomName: text("room_name").notNull(),
    roomMode: text("room_mode").notNull(),
    handNumber: integer("hand_number").notNull(),
    userId: text("user_id").notNull(),
    playerName: text("player_name").notNull(),
    net: integer("net").notNull(),
    endingChips: integer("ending_chips").notNull(),
    won: integer("won", { mode: "boolean" }).notNull(),
    resultText: text("result_text").notNull(),
    completedAt: integer("completed_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_hand_results_unique_player_hand").on(table.roomId, table.handNumber, table.userId),
    index("idx_hand_results_user_completed").on(table.userId, table.completedAt),
    index("idx_hand_results_room_hand").on(table.roomId, table.handNumber),
  ],
);

export const userCredentials = sqliteTable("user_credentials", {
  userId: text("user_id").primaryKey().notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_user_credentials_email").on(table.email)]);

export const sessions = sqliteTable(
  "sessions",
  {
    token: text("token").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("idx_sessions_user").on(table.userId)],
);
