import { computed, shallowRef, readonly } from "vue";
import { createGlobalState } from "@vueuse/core";
import { AppConfig, poeWebApi } from "@/web/Config";
import { Host } from "./IPC";

// pc-ggg, pc-garena
// const PERMANENT_SC = ['Standard', '標準模式']
// const PERMANENT_HC = ["Hardcore", "專家模式"];

interface TradeLeague {
  id: string;
  text: string;
}

interface League {
  id: string;
  isPopular: boolean;
  text: string;
}

export const useLeagues = createGlobalState(() => {
  const isLoading = shallowRef(false);
  const error = shallowRef<string | null>(null);
  const tradeLeagues = shallowRef<League[]>([]);

  const selectedId = computed<string | undefined>({
    get() {
      return tradeLeagues.value.length ? AppConfig().leagueId : undefined;
    },
    set(id) {
      AppConfig().leagueId = id;
    },
  });

  const selected = computed(() => {
    const { leagueId } = AppConfig();
    if (!tradeLeagues.value || !leagueId) return undefined;
    const listed = tradeLeagues.value.find((league) => league.id === leagueId);
    return {
      id: leagueId,
      realm: AppConfig().realm,
      isPopular: !isPrivateLeague(leagueId) && Boolean(listed?.isPopular),
    };
  });

  async function load() {
    isLoading.value = true;
    error.value = null;

    try {
      // TODO: swap back to /api/leagues?realm=poe2 when available (allows detection of Hardcore leagues)
      const response = await Host.proxy(
        `${poeWebApi()}/api/trade2/data/leagues`,
      );
      if (!response.ok)
        throw new Error(JSON.stringify(Object.fromEntries(response.headers)));
      const leagues: { result: TradeLeague[] } = await response.json();
      tradeLeagues.value = leagues.result.map((league) => {
        return { id: league.id, isPopular: true, text: league.text };
      });

      const leagueIsAlive = tradeLeagues.value.some(
        (league) => league.id === selectedId.value,
      );
      if (!leagueIsAlive && !isPrivateLeague(selectedId.value ?? "")) {
        selectedId.value = pickDefaultLeague(
          tradeLeagues.value.map((league) => league.id),
        );
      }
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      isLoading.value = false;
    }
  }

  const isOlder = computed(() =>
    isOlderLeague(
      selectedId.value ?? "",
      tradeLeagues.value.map((league) => league.id),
    ),
  );

  return {
    isLoading,
    error,
    selectedId,
    selected,
    isOlder,
    list: readonly(tradeLeagues),
    load,
  };
});

function isPrivateLeague(id: string) {
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
