/** Match the Tower even when the router receives mixed-case or encoded paths. */
export function isTowerPath(pathname: string) {
  let value = pathname;
  try {
    for (let i = 0; i < 2; i++) {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    }
  } catch {
    // Fail closed on malformed URLs instead of risking a routing discrepancy.
    return true;
  }
  const segments: string[] = [];
  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments[0]?.toLowerCase() === "torre";
}

export async function canAccessTowerPath(pathname: string, authorize: () => Promise<unknown>) {
  if (!isTowerPath(pathname)) return true;
  try {
    return Boolean(await authorize());
  } catch {
    return false;
  }
}
