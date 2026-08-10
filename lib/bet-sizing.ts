export function potFractionRaiseTarget(input: {
  pot: number;
  callAmount: number;
  playerStreetBet: number;
  fraction: number;
  bigBlind: number;
  minRaiseTo: number;
  maxRaiseTo: number;
}) {
  const currentBet = input.playerStreetBet + input.callAmount;
  const potAfterCall = input.pot + input.callAmount;
  const rawTarget = currentBet + potAfterCall * input.fraction;
  const roundedTarget = Math.ceil(rawTarget / input.bigBlind) * input.bigBlind;
  return Math.max(input.minRaiseTo, Math.min(input.maxRaiseTo, roundedTarget));
}
