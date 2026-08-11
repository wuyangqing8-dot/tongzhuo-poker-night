export type PokerTablePosition = "BTN / SB" | "BTN" | "SB" | "BB" | "UTG" | "UTG+1" | "UTG+2" | "MP" | "LJ" | "HJ" | "CO";

type SeatedPlayer = {
  id: string;
  seat: number;
  hole: readonly unknown[];
  isKicked?: boolean;
};

const positionOrders: Record<number, PokerTablePosition[]> = {
  2: ["BTN / SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "UTG+1", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "LJ", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"],
  10: ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "MP", "LJ", "HJ", "CO"],
};

export function getTablePositions(players: readonly SeatedPlayer[], dealerSeat: number, maxSeats: number) {
  const positions = new Map<string, PokerTablePosition>();
  if (dealerSeat < 0 || maxSeats < 2) return positions;

  const dealtPlayers = players
    .filter((player) => !player.isKicked && player.hole.length === 2)
    .sort((left, right) => circularDistance(left.seat, dealerSeat, maxSeats) - circularDistance(right.seat, dealerSeat, maxSeats));
  const labels = positionOrders[dealtPlayers.length];
  if (!labels) return positions;
  dealtPlayers.forEach((player, index) => positions.set(player.id, labels[index]));
  return positions;
}

function circularDistance(seat: number, origin: number, maxSeats: number) {
  return (seat - origin + maxSeats) % maxSeats;
}
