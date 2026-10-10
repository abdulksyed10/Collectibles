/** Coordinates a screen's refreshes and pagination without allowing an old
 * response to overwrite the newest viewer or visibility state. */
export function createSharedRequestGate() {
  let generation = 0;
  let moreInFlight = false;
  return {
    beginRefresh() { generation += 1; return generation; },
    current() { return generation; },
    invalidate() { generation += 1; moreInFlight = false; },
    isCurrent(request: number) { return request === generation; },
    beginMore() {
      if (moreInFlight) return false;
      moreInFlight = true;
      return true;
    },
    endMore() { moreInFlight = false; },
  };
}

export function appendUniqueEntries<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map(entry => entry.id));
  const result = [...current];
  for (const entry of incoming) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}
