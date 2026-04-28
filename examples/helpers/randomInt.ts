export default function randomInt(min: string, max: string): number {
  const lo = Number(min);
  const hi = Number(max);

  if (Number.isNaN(lo) || Number.isNaN(hi)) {
    throw new Error(`randomInt: invalid bounds "${min}" / "${max}"`);
  }

  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
