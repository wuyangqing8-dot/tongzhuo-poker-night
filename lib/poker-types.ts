export type Suit = "S" | "H" | "D" | "C";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type CardCode = `${Rank}${Suit}`;
export type GamePhase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
export type PlayerAction = "fold" | "check" | "call" | "raise";

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
  lastPot: number;
  resultText: string;
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
  resultText: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
};
