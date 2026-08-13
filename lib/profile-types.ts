export type ProfileHandResult = {
  id: number;
  roomId: string;
  roomCode: string;
  roomName: string;
  roomMode: "classic" | "party";
  handNumber: number;
  net: number;
  endingChips: number;
  won: boolean;
  resultText: string;
  completedAt: number;
};

export type ProfileRoomSummary = {
  roomId: string;
  roomCode: string;
  roomName: string;
  roomMode: "classic" | "party";
  hands: number;
  wins: number;
  net: number;
  endingChips: number;
  lastPlayedAt: number;
};

export type PlayerProfile = {
  user: { id: string; email: string; displayName: string; createdAt: number };
  summary: {
    totalHands: number;
    wins: number;
    winRate: number;
    totalNet: number;
    bestHand: number;
    worstHand: number;
    rooms: number;
    biggestEndingStack: number;
    currentWinStreak: number;
  };
  recentHands: ProfileHandResult[];
  rooms: ProfileRoomSummary[];
};
