// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PairRates from "@/web/price-check/trends/PairRates.vue";
import type { ItemPairs, PairStat } from "@/web/background/market/types.ts";

const ASOF = 1793599200; // 06:00 UTC; the hour's data is complete at 07:00

function stat(
  typical: number,
  low: number,
  high: number,
  traded: number,
  last?: PairStat["last"],
) {
  return {
    typical,
    low,
    high,
    traded,
    quoteTraded: typical * traded,
    hours: 6,
    asOfHour: ASOF,
    ...(last ? { last } : {}),
  } satisfies PairStat;
}

// Arcanist's Etcher over the six recorded hours.
const ETCHER: ItemPairs = {
  exalted: stat(4.908, 3, 14, 2456),
  chaos: stat(0.1561, 0.05, 0.25, 3864),
  divine: stat(0.01894, 0.01205, 0.02326, 4118),
};

function render(props: Record<string, unknown> = {}) {
  return mount(PairRates, {
    props: {
      pairs: ETCHER,
      selected: "exalted",
      asOfHour: ASOF,
      nowMs: (ASOF + 3600 + 25 * 60) * 1000,
      ninjaText: "12.3 ex, from the divine pair",
      ...props,
    },
  });
}

function text(s: string) {
  return s.replace(/\s+/g, " ").replace(/\u200A/g, "");
}

describe("PairRates", () => {
  it("shows the typical value for every pair, the range on hover", () => {
    const rows = render().findAll("[data-pair]");
    expect(rows.map((r) => r.attributes("data-pair"))).toEqual([
      "exalted",
      "chaos",
      "divine",
    ]);
    const ex = text(rows[0].text());
    expect(ex).toContain("4.9");
    expect(ex).toContain("2.5k");
    expect(text(rows[0].findAll("td")[1].attributes("title")!)).toBe(
      "6 h range 3 – 14",
    );
  });

  it("writes rates below one as fractions, as the game does", () => {
    const rows = render().findAll("[data-pair]");
    expect(text(rows[1].text())).toContain("1/6.4");
    expect(text(rows[1].findAll("td")[1].attributes("title")!)).toContain(
      "1/20 – 1/4",
    );
    expect(text(rows[2].text())).toContain("1/53");
  });

  it("suggests selling now into buy orders or listing at the last hour's average", () => {
    // Omen of the Blessed: buy orders filled from 64 ex, the hour averaged 146.
    const rows = render({
      pairs: {
        exalted: stat(121, 64, 200, 55, {
          hour: ASOF,
          typical: 3355 / 23,
          low: 64,
          high: 200,
          traded: 23,
        }),
        divine: stat(1 / 3.4, 1 / 4, 1 / 3, 1500, {
          hour: ASOF,
          typical: 36 / 129,
          low: 1 / 4,
          high: 1 / 3,
          traded: 129,
        }),
      },
    }).findAll("[data-pair]");
    expect(text(rows[0].find("[data-sell]").text())).toBe("64");
    expect(text(rows[0].find("[data-list]").text())).toBe("146");
    expect(text(rows[1].find("[data-sell]").text())).toBe("1/4");
    expect(text(rows[1].find("[data-list]").text())).toBe("1/3.6");
  });

  it("shows a dash where an old snapshot has no last hour", () => {
    const rows = render().findAll("[data-pair]");
    expect(text(rows[0].find("[data-sell]").text())).toBe("–");
    expect(text(rows[0].find("[data-list]").text())).toBe("–");
  });

  it("marks the pair the headline uses", () => {
    const rows = render({ selected: "chaos" }).findAll("[data-pair]");
    expect(rows[1].classes()).toContain("text-gray-200");
    expect(rows[0].classes()).not.toContain("text-gray-200");
  });

  it("keeps poe.ninja's figure as a labelled reference", () => {
    expect(text(render().find("[data-ninja]").text())).toContain(
      "poe.ninja: 12.3 ex, from the divine pair",
    );
    expect(render({ ninjaText: undefined }).find("[data-ninja]").exists()).toBe(
      false,
    );
  });

  it("says how old the data is", () => {
    expect(text(render().find("[data-age]").text())).toContain("25 min ago");
    const later = render({ nowMs: (ASOF + 3600 + 3 * 3600) * 1000 });
    expect(text(later.find("[data-age]").text())).toContain("3 h ago");
  });

  it("labels the columns and names the currencies in full", () => {
    const wrapper = render();
    expect(text(wrapper.find("thead").text())).toMatch(
      /Rate.*Sell now.*List at.*Traded/,
    );
    const rows = wrapper.findAll("[data-pair]");
    expect(rows.map((r) => r.find("td").text().trim())).toEqual([
      "Exalted",
      "Chaos",
      "Divine",
    ]);
    expect(rows[0].find("img").attributes("src")).toBe("/images/exa.png");
  });

  it("marks pairs under the thin bar, not only unusable ones", () => {
    const rows = render({
      pairs: { ...ETCHER, exalted: stat(162, 60, 249, 30) },
    }).findAll("[data-pair]");
    expect(text(rows[0].text())).toContain("thin");
    expect(text(rows[1].text())).not.toContain("thin");
  });

  it("marks thin pairs", () => {
    const rows = render({
      pairs: { ...ETCHER, exalted: stat(12, 12, 12, 3) },
    }).findAll("[data-pair]");
    expect(text(rows[0].text())).toContain("thin");
  });
});
