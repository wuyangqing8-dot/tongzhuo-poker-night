export function potFractionRaiseTarget(input: {
  pot: number;
  callAmount: number;
  playerStreetBet: number;
  fraction: number;
  chipStep?: number;
  minRaiseTo: number;
  maxRaiseTo: number;
}) {
  const currentBet = input.playerStreetBet + input.callAmount;
  const potAfterCall = input.pot + input.callAmount;
  const rawTarget = currentBet + potAfterCall * input.fraction;
  const chipStep = Math.max(1, Math.floor(input.chipStep ?? 1));
  const roundedTarget = Math.round(rawTarget / chipStep) * chipStep;
  return Math.max(input.minRaiseTo, Math.min(input.maxRaiseTo, roundedTarget));
}
