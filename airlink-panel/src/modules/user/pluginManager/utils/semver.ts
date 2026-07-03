export function compareSemver(a: string, b: string): number {
  const parse = (value: string): number[] => {
    const cleaned = value.trim().replace(/^v/i, '').split('+')[0].split('-')[0];
    return cleaned.split('.').map((part) => {
      const match = part.match(/^\d+/);
      return match ? Number.parseInt(match[0], 10) : 0;
    });
  };

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) > 0;
}
