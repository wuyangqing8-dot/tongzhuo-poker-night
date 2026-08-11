export type Suit = "S" | "H" | "D" | "C";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type CardCode = `${Rank}${Suit}`;
export type GamePhase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
export type PlayerAction = "fold" | "check" | "call" | "raise";
export type PokerRoomMode = "classic" | "party";
export type PartyTriggerId = "quads" | "straight_flush" | "full_house" | "seven_two" | "high_card" | "all_in_win" | "river_comeback" | "bad_beat" | "knockout";
export type PartyEffectId = "sky_eye" | "public_card" | "peek_shield" | "river_redraw" | "turn_redraw" | "redraw_one" | "redraw_hand" | "free_big_blind" | "spin_again" | "get_peeked" | "open_card" | "no_raise" | "mini_raise" | "river_judgement" | "random_turn" | "seat_swap" | "emperor_button" | "pass_left" | "thanks";
export type PartyEffectStatus = "pending" | "active" | "used" | "expired";
export type PartyEffectEventKind = "awarded" | "armed" | "executed" | "expired";
export type PartyEffectPresentation = "reward" | "reveal" | "hole_redraw" | "board_redraw" | "pass_left" | "seat_swap" | "shield" | "rule";

export type PartyRuntimeEffect = {
  id: string;
  effectId: PartyEffectId;
  awardedHand: number;
  appliesHand: number;
  status: PartyEffectStatus;
  detail?: string;
};

export type PartyPlayerState = {
  playerId: string;
  credits: number;
  achievementCount: number;
  effects: PartyRuntimeEffect[];
};

export type PartyReveal = {
  viewerId: string | "all";
  playerId: string;
  cardIndex: number;
  handNumber: number;
};

export type PartyAward = {
  id: string;
  playerId: string;
  playerName: string;
  triggerId: PartyTriggerId;
  triggerName: string;
  handNumber: number;
  at: number;
};

export type PartySpin = {
  id: string;
  playerId: string;
  playerName: string;
  effectId: PartyEffectId;
  effectName: string;
  emoji: string;
  description: string;
  effectIndex: number;
  at: number;
};

export type PartyEffectEvent = {
  id: string;
  playerId: string;
  playerName: string;
  effectId: PartyEffectId;
  effectName: string;
  emoji: string;
  kind: PartyEffectEventKind;
  title: string;
  detail: string;
  handNumber: number;
  at: number;
  visibility: "all" | string;
  presentation: PartyEffectPresentation;
  cards?: CardCode[];
};

export type PartyGameState = {
  enabledTriggers: PartyTriggerId[];
  maxStoredCredits: number;
  playerStates: Record<string, PartyPlayerState>;
  reveals: PartyReveal[];
  turnLeaderIds: string[];
  lastAwards: PartyAward[];
  lastSpin?: PartySpin;
  effectEvents: PartyEffectEvent[];
};

export type DealerProfile = {
  id: string;
  name: string;
  image: string;
  isCustom: boolean;
};

export type TableActionEvent = {
  id: string;
  playerId: string;
  playerName: string;
  isBot: boolean;
  action: PlayerAction;
  label: string;
  amount: number;
  at: number;
};

export type GamePlayer = {
  id: string;
  name: string;
  email: string | null;
  seat: number;
  chips: number;
  streetBet: number;
  contribution: number;
  hole: CardCode[];
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  isBot: boolean;
  lastAction: string;
  lastSeenAt: number;
  pendingRebuy?: number;
  isKicked?: boolean;
  leftVoluntarily?: boolean;
  totalBuyIn?: number;
};

export type GameLog = {
  id: string;
  text: string;
  at: number;
  kind: "action" | "system" | "result";
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: number;
};

export type PokerGameState = {
  roomId: string;
  roomCode: string;
  roomName: string;
  ownerId: string;
  maxPlayers: number;
  startingChips: number;
  roomMode?: PokerRoomMode;
  party?: PartyGameState;
  smallBlind: number;
  bigBlind: number;
  version: number;
  handNumber: number;
  phase: GamePhase;
  dealerSeat: number;
  turnSeat: number | null;
  currentBet: number;
  minRaise: number;
  board: CardCode[];
  deck: CardCode[];
  players: GamePlayer[];
  logs: GameLog[];
  chats: ChatMessage[];
  actionDeadline: number | null;
  nextHandAt: number | null;
  paused: boolean;
  pausedAt: number | null;
  pausedByName: string | null;
  lastPot: number;
  resultText: string;
  dealer?: DealerProfile;
  actionFeed?: TableActionEvent[];
  createdAt: number;
  updatedAt: number;
};

export type PublicPlayer = Omit<GamePlayer, "hole" | "email"> & {
  hole: CardCode[] | null;
  isOnline: boolean;
};

export type ValidActions = {
  isYourTurn: boolean;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  callAmount: number;
  minRaiseTo: number;
  maxRaiseTo: number;
};

export type PublicGameView = {
  room: {
    id: string;
    code: string;
    name: string;
    ownerId: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    startingChips: number;
    mode: PokerRoomMode;
  };
  viewerId: string;
  version: number;
  handNumber: number;
  phase: GamePhase;
  dealerSeat: number;
  turnSeat: number | null;
  board: CardCode[];
  pot: number;
  players: PublicPlayer[];
  logs: GameLog[];
  chats: ChatMessage[];
  validActions: ValidActions;
  actionDeadline: number | null;
  nextHandAt: number | null;
  paused: boolean;
  pausedAt: number | null;
  pausedByName: string | null;
  resultText: string;
  dealer: DealerProfile;
  actionFeed: TableActionEvent[];
  party?: PartyGameState;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
};
