export interface DeckBoardLabelSet {
  field: string;
  pictureFrame: string[];
  breaker: string[];
}

const alphaLabel = (index: number) => {
  let n = Math.max(0, Math.floor(index));
  let out = '';
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

export function deriveDeckBoardLabels(values: Record<string, string | number | boolean>) : DeckBoardLabelSet {
  const pictureFrameCount = Math.max(0, Math.round(Number(values.pictureFrameCount ?? 1)));
  const breakerBoardCount = Math.max(0, Math.round(Number(values.breakerBoardCount ?? 0)));
  let cursor = 0;
  const field = alphaLabel(cursor++);
  const pictureFrame = Array.from({ length: pictureFrameCount }, () => alphaLabel(cursor++));
  const breaker = Array.from({ length: breakerBoardCount }, () => alphaLabel(cursor++));
  return { field, pictureFrame, breaker };
}
