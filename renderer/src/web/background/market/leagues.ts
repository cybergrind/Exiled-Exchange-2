// Which league is current, from the trade site's league list. Shared by the
// app (Leagues.ts) and the update-prices CLI; erasable TypeScript only.

export function isPrivateLeague(id: string) {
  if (id.includes("Ruthless")) {
    return true;
  }
  return /\(PL\d+\)$/.test(id);
}

const PERMANENT = new Set(["Standard", "Hardcore"]);

function isChallengeSoftcore(id: string) {
  return !PERMANENT.has(id) && !id.startsWith("HC ") && !isPrivateLeague(id);
}

/**
 * The current challenge league. Picked by name, not by position: the trade API
 * has listed it both after and before the permanent leagues.
 */
export function pickDefaultLeague(ids: readonly string[]): string | undefined {
  return (
    ids.find(isChallengeSoftcore) ??
    ids.find((id) => id === "Standard") ??
    ids[0]
  );
}

/** True when `id` is a listed league older than the current challenge league. */
export function isOlderLeague(id: string, ids: readonly string[]): boolean {
  if (!ids.includes(id) || PERMANENT.has(id) || isPrivateLeague(id)) {
    return false;
  }
  const current = pickDefaultLeague(ids);
  return id !== current && id !== `HC ${current}`;
}
