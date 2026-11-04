import { describe, expect, it } from "vitest";
import { exchangeValue } from "@/web/background/market/exchangeValue.ts";
import { QUOTE_IDS, THIN_TRADED } from "@/web/background/market/constants.ts";
import type {
  ItemPairs,
  PairStat,
  PairTable,
} from "@/web/background/market/types.ts";

const HOUR = 1793599200;

function stat(typical: number, traded: number, low = typical, high = typical) {
  return {
    typical,
    low,
    high,
    traded,
    quoteTraded: typical * traded,
    hours: 6,
    asOfHour: HOUR,
  } satisfies PairStat;
}

// Golden figures from the six recorded hours (WP-11), rounded.
const ETCHER: ItemPairs = {
  exalted: stat(4.908, 2456, 3, 14),
  chaos: stat(0.1561, 3864, 0.05, 0.25),
  divine: stat(0.0189, 4118, 0.012, 0.0233),
};

// Rates between the quote currencies, as the aggregator reports them.
const TABLE: PairTable = {
  [QUOTE_IDS.divine]: { exalted: stat(681.2, 2900), chaos: stat(9.69, 160000) },
  [QUOTE_IDS.chaos]: { exalted: stat(70.3, 4000), divine: stat(0.1032, 1e6) },
  [QUOTE_IDS.exalted]: {
    divine: stat(0.001468, 1.9e6),
    chaos: stat(0.01423, 300000),
  },
};

const NINJA_ETCHER = { primaryValue: 0.01816 };

describe("exchangeValue", () => {
  it("rule 1: shows the item's own pair in the core currency", () => {
    const v = exchangeValue({ pairs: ETCHER, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(1);
    expect(v.source).toBe("ggg");
    expect(v.currency).toBe("exalted");
    expect(v.value).toBe(4.908);
    expect([v.low, v.high]).toEqual([3, 14]);
    expect(v.ordering).toBe(4.908);
    expect(v.asOfHour).toBe(HOUR);
  });

  it("rule 1 in chaos when chaos is the core currency", () => {
    const v = exchangeValue({ pairs: ETCHER, core: "chaos", table: TABLE })!;
    expect(v.rule).toBe(1);
    expect(v.currency).toBe("chaos");
    expect(v.value).toBe(0.1561);
  });

  it("rule 2: falls back to another pair without converting the display", () => {
    const pairs: ItemPairs = { divine: stat(0.06017, 154) };
    const v = exchangeValue({ pairs, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(2);
    expect(v.currency).toBe("divine");
    expect(v.value).toBe(0.06017);
    // Ordering is converted once, through the GGG divine-exalted rate.
    expect(v.ordering).toBeCloseTo(0.06017 * 681.2, 6);
  });

  it("rule 2: prefers the pair with more traded units", () => {
    const pairs: ItemPairs = {
      chaos: stat(0.35, 400),
      divine: stat(0.06, 150),
    };
    expect(
      exchangeValue({ pairs, core: "exalted", table: TABLE })!.currency,
    ).toBe("chaos");
  });

  it("a thin core pair falls through to the next rule", () => {
    const pairs: ItemPairs = {
      exalted: stat(12, 3),
      divine: stat(0.0189, 4118),
    };
    const v = exchangeValue({ pairs, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(2);
    expect(v.currency).toBe("divine");
  });

  it("a core pair under the thin bar yields to the busiest pair", () => {
    // Runic Alloy as seen in-game: ten exalted trades against 96 chaos ones.
    const pairs: ItemPairs = {
      exalted: stat(162, 10, 60, 249),
      chaos: stat(2.8, 96, 1, 4.5),
      divine: stat(1 / 7, 28),
    };
    const v = exchangeValue({ pairs, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(2);
    expect(v.currency).toBe("chaos");
    expect(v.value).toBe(2.8);
  });

  it("a thin core pair is kept when the other pair is not clearly busier", () => {
    // Medved's Crest of the Circle as seen in-game: 44 exalted, 69 chaos.
    const pairs: ItemPairs = {
      exalted: stat(1.1, 44, 0.9, 2),
      chaos: stat(1 / 17, 69, 1 / 18, 1 / 17),
    };
    const v = exchangeValue({ pairs, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(1);
    expect(v.value).toBe(1.1);
  });

  it("a thin core pair is kept when no other pair is busier", () => {
    const pairs: ItemPairs = {
      exalted: stat(162, 30),
      divine: stat(0.14, 12),
    };
    const v = exchangeValue({ pairs, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(1);
    expect(v.currency).toBe("exalted");
  });

  it("a core pair at the thin bar stays the headline, however busy the others", () => {
    const pairs: ItemPairs = {
      exalted: stat(0.045, THIN_TRADED),
      divine: stat(0.00007, 7_500_000),
    };
    expect(
      exchangeValue({ pairs, core: "exalted", table: TABLE })!.currency,
    ).toBe("exalted");
  });

  it("a core pair past the thin bar yields when a busier pair disagrees", () => {
    // Omen of the Blessed as seen in-game: 154 at 76 ex, while 566 went at
    // 2.7 chaos and 1.5K at 1/3.4 div (both about 200 ex).
    const pairs: ItemPairs = {
      exalted: stat(76, 154, 65, 149),
      chaos: stat(2.7, 566, 2, 4),
      divine: stat(1 / 3.4, 1500, 1 / 4, 1 / 2),
    };
    const v = exchangeValue({ pairs, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(2);
    expect(v.currency).toBe("divine");
    expect(v.value).toBeCloseTo(1 / 3.4, 6);
  });

  it("a core pair past the thin bar stays when the busier pair agrees", () => {
    const pairs: ItemPairs = {
      exalted: stat(190, 154),
      divine: stat(1 / 3.4, 1500),
    };
    const v = exchangeValue({ pairs, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(1);
    expect(v.value).toBe(190);
  });

  it("a busy core pair is kept for cheap items, whose divine fills are coarse", () => {
    // Orb of Alchemy: 2.44 ex on 16K trades; 0.0063 div on 65K.
    const pairs: ItemPairs = {
      exalted: stat(2.44, 16328),
      divine: stat(0.0063, 65556),
    };
    const v = exchangeValue({ pairs, core: "exalted", table: TABLE })!;
    expect(v.rule).toBe(1);
    expect(v.value).toBe(2.44);
  });

  it("rule 3: poe.ninja's value, converted and marked, when no pair is liquid", () => {
    const v = exchangeValue({
      pairs: { exalted: stat(12, 3) },
      core: "exalted",
      table: TABLE,
      ninja: NINJA_ETCHER,
    })!;
    expect(v.rule).toBe(3);
    expect(v.source).toBe("ninja");
    expect(v.currency).toBe("exalted");
    expect(v.value).toBeCloseTo(0.01816 * 681.2, 6);
    expect(v.low).toBeUndefined();
    expect(v.ordering).toBe(v.value);
  });

  it("a thin pair beats poe.ninja when no pair is liquid, marked thin", () => {
    // Owl Idol: 6 at 6.3 ex and 7 at 4.1 c over 3 hours; poe.ninja read
    // the chaos pair (about 310 ex). In game it sold from 6 ex.
    const pairs: ItemPairs = {
      exalted: { ...stat(6.33, 6, 5, 8), hours: 3 },
      chaos: { ...stat(4.14, 7, 3, 6), hours: 3 },
    };
    const v = exchangeValue({
      pairs,
      core: "exalted",
      table: TABLE,
      ninja: { primaryValue: 0.4361 },
    })!;
    expect(v.source).toBe("ggg");
    expect(v.rule).toBe(1);
    expect(v.value).toBe(6.33);
    expect(v.thin).toBe(true);
  });

  it("a thin pair from a single hour still falls to poe.ninja", () => {
    const v = exchangeValue({
      pairs: { exalted: { ...stat(6.33, 8), hours: 1 } },
      core: "exalted",
      table: TABLE,
      ninja: NINJA_ETCHER,
    })!;
    expect(v.rule).toBe(3);
  });

  it("rule 3 also applies when the feed has no data for the item", () => {
    const v = exchangeValue({
      pairs: undefined,
      core: "exalted",
      table: TABLE,
      ninja: NINJA_ETCHER,
    })!;
    expect(v.rule).toBe(3);
  });

  it("rule 4: nothing to show", () => {
    expect(
      exchangeValue({ pairs: undefined, core: "exalted", table: TABLE }),
    ).toBeNull();
  });

  it("prices Divine Orb in exalts and Exalted Orb against the others", () => {
    const divine = exchangeValue({
      pairs: TABLE[QUOTE_IDS.divine],
      core: "exalted",
      table: TABLE,
    })!;
    expect(divine.rule).toBe(1);
    expect(divine.value).toBe(681.2);

    const exalted = exchangeValue({
      pairs: TABLE[QUOTE_IDS.exalted],
      core: "exalted",
      table: TABLE,
    })!;
    expect(exalted.rule).toBe(2);
    expect(exalted.currency).toBe("divine");
    expect(exalted.ordering).toBeCloseTo(1, 1);
  });

  it("never shows the busiest pair converted into the core currency", () => {
    // The defect being removed: 0.01816 div x 681 = 12.4 ex for the Etcher,
    // whose exalted market traded around 4.9 ex.
    const v = exchangeValue({
      pairs: ETCHER,
      core: "exalted",
      table: TABLE,
      ninja: NINJA_ETCHER,
    })!;
    expect(v.value).toBeLessThan(6);
  });
});
