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
