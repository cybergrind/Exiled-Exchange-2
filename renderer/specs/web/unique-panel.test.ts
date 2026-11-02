// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UniquePanel from "@/web/price-check/uniques/UniquePanel.vue";
import {
  parseUniqueOverview,
  uniqueVariants,
} from "@/web/background/market/uniques.ts";
import { fixture } from "./market/prices-harness";

// WP-52, over the recorded weapon lines: Brynhand's Mark has a regular,
// a Runeforged and a 1-listing Runemastered line; Tidebreaker ×396.
const LINES = parseUniqueOverview(
  "UniqueWeapons",
  JSON.parse(fixture("stash-unique-weapons.json")),
)!;

function render(name: string, current: string) {
  return mount(UniquePanel, {
    props: {
      name,
      variants: uniqueVariants(LINES, name),
      current,
      formatPrice: (div: number) => `${div} div`,
    },
  });
}

const text = (s: string) => s.replace(/\s+/g, " ").trim();

describe("UniquePanel", () => {
  it("lists every version of the unique, the checked one highlighted", () => {
    const wrapper = render("Brynhand's Mark", "Runeforged Wooden Club");
    const rows = wrapper.findAll("[data-variant]");
    expect(rows.map((r) => r.attributes("data-variant"))).toEqual([
      "regular",
      "Runeforged",
      "Runemastered",
    ]);
    expect(rows.map((r) => r.attributes("data-current") !== undefined)).toEqual(
      [false, true, false],
    );
  });

  it("gives a rune version's multiple of the regular version", () => {
    const row = render("Tidebreaker", "Pointed Maul").find(
      '[data-variant="Runeforged"]',
    );
    expect(text(row.text())).toContain("0.5663 div");
    expect(text(row.find("[data-multiple]").text())).toBe(
      "×396 the regular version",
    );
  });

  it("hides the multiple and dims a low-confidence price", () => {
    const row = render("Brynhand's Mark", "Wooden Club").find(
      '[data-variant="Runemastered"]',
    );
    expect(row.find("[data-multiple]").exists()).toBe(false);
    expect(row.find("[data-price]").classes()).toContain("opacity-50");
    expect(row.text()).toContain("1 listing");
  });

  it("warns that rune versions can be worth less when one is", () => {
    // Brynhand's Mark Runeforged: 0.00143 against 0.0043, ×0.33.
    const wrapper = render("Brynhand's Mark", "Wooden Club");
    expect(wrapper.find("[data-caveat]").text()).toBe(
      "Rune versions can be worth less than the regular one; prices can mix several recipe results.",
    );
    expect(
      render("Tidebreaker", "Pointed Maul").find("[data-caveat]").exists(),
    ).toBe(false);
  });

  it("explains rune versions without giving a reason for the price", () => {
    const title = render("Tidebreaker", "Pointed Maul")
      .find("[data-explain]")
      .attributes("title")!;
    expect(title).toContain("Verisium Anvil");
    expect(title).not.toMatch(/upgrade|better|permanent|random/i);
  });
});
