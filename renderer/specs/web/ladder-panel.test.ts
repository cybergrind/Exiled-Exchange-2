// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import LadderPanel from "@/web/price-check/ladder/LadderPanel.vue";
import { buildLadder, type Ladder } from "@/web/price-check/ladder/ladder.ts";
import { categoryItems, TABLE } from "./ladder-fixture";

// WP-41, fed by buildLadder over the recorded omens (38 lines).
function omens(checked: string): Ladder {
  return buildLadder({
    items: categoryItems("Ritual"),
    table: TABLE,
    core: "exalted",
    checked,
  });
}

function render(props: Record<string, unknown> = {}, slots = {}) {
  return mount(LadderPanel, {
    props: {
      ladder: omens("Omen of Chaotic Quantity"),
      category: "Omens",
      ...props,
    },
    slots,
  });
}

function text(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

describe("LadderPanel", () => {
  it("never cuts a name off", () => {
    const names = render().findAll("[data-name]");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.classes()).not.toContain("truncate");
  });

  it("shows short names with the full name as a tooltip", () => {
    const name = render().find(".bg-gray-700 [data-name]");
    expect(text(name.text())).toBe("Chaotic Quantity");
    expect(name.attributes("title")).toBe("Omen of Chaotic Quantity");
  });

  it("shows the rank in the category", () => {
    const ladder = omens("Omen of Chaotic Quantity");
    expect(text(render().find("[data-rank]").text())).toBe(
      `${ladder.rank} of 38 Omens`,
    );
  });

  it("shows 5 rows above and below, the checked item highlighted", () => {
    const wrapper = render();
    const rows = wrapper.findAll("[data-row]");
    expect(rows).toHaveLength(11);
    const checked = wrapper.findAll("[data-checked]");
    expect(checked).toHaveLength(1);
    expect(checked[0].find("[data-name]").attributes("title")).toBe(
      "Omen of Chaotic Quantity",
    );
    expect(rows[5].attributes("data-checked")).toBeDefined();
    expect(rows[5].classes()).toContain("bg-gray-700");
  });

  it("marks poe.ninja estimates, not own pairs, and colours the change", () => {
    const rows = render({ ladder: omens("Omen of Bartering") }).findAll(
      "[data-row]",
    );
    // Bartering trades on its own exalted pair (1558 units): no marker.
    const bartering = rows.find((r) => r.attributes("data-checked") != null)!;
    expect(bartering.find("[data-name]").attributes("title")).toBe(
      "Omen of Bartering",
    );
    expect(bartering.find("[data-estimate]").exists()).toBe(false);
    expect(bartering.find("[data-thin]").exists()).toBe(false);
    expect(bartering.find("[data-change]").text()).toBe("+30%");
    expect(bartering.find("[data-change]").classes()).toContain(
      "text-green-500",
    );
    const others = rows.filter((r) => r !== bartering);
    for (const row of others) {
      // A mark on the value, so it takes no room from the name.
      expect(row.find("[data-value] [data-estimate]").text()).toBe("≈");
      expect(row.find("[data-estimate]").attributes("title")).toMatch(
        /poe\.ninja estimate/,
      );
    }
    const down = rows.find((r) =>
      r.find("[data-change]").text().startsWith("-"),
    )!;
    expect(down.find("[data-change]").classes()).toContain("text-red-500");
  });

  it("marks a thin pair", () => {
    // Bartering's exalted pair as if only 30 units had traded.
    const items = categoryItems("Ritual").map((item) =>
      item.name === "Omen of Bartering"
        ? {
            ...item,
            pairs: { exalted: { ...item.pairs!.exalted!, traded: 30 } },
          }
        : item,
    );
    const ladder = buildLadder({
      items,
      table: TABLE,
      core: "exalted",
      checked: "Omen of Bartering",
    });
    const row = render({ ladder }).find("[data-checked]");
    expect(row.find("[data-value]").attributes("data-thin")).toBeDefined();
    expect(row.find("[data-value]").classes()).toContain("text-yellow-500");
    expect(row.find("[data-value]").attributes("title")).toMatch(/thin/i);
  });

  it("marks an item without a price", () => {
    const items = categoryItems("Ritual").map((item) =>
      item.name === "Omen of Chance" ? { name: item.name, ns: item.ns } : item,
    );
    const ladder = buildLadder({
      items,
      table: TABLE,
      core: "exalted",
      checked: "Omen of Chance",
    });
    const row = render({ ladder }).find("[data-checked]");
    expect(row.find("[data-no-value]").text()).toBe("no price");
    expect(row.find("[data-value]").text()).toBe("?");
    expect(row.find("[data-bar]").exists()).toBe(false);
  });

  it("writes values the way the exchange does", () => {
    const rows = render({ ladder: omens("Omen of the Liege") }).findAll(
      "[data-row]",
    );
    const liege = rows.at(-1)!;
    // 2.949e-05 div at about 681 ex/div: 1/50 ex, marked as an estimate.
    expect(text(liege.find("[data-value]").text())).toBe("≈1/50");
    expect(liege.find("[data-value] img").attributes("src")).toBe(
      "/images/exa.png",
    );
  });

  it("draws a log-scale bar", () => {
    const wrapper = render({ ladder: omens("Omen of Sinistral Annulment") });
    const bars = wrapper.findAll("[data-bar]");
    expect(bars[0].attributes("style")).toContain("width: 100%");
    const second = omens("Omen of Sinistral Annulment").rows[1].bar;
    expect(bars[1].attributes("style")).toContain(
      `width: ${Number((second * 100).toFixed(1))}%`,
    );
  });

  it("labels the dividers at 1 div and 1 ex", () => {
    const top = render({ ladder: omens("Omen of Sanctification") });
    expect(top.findAll("[data-divider]").map((d) => d.text())).toEqual([
      "1 div",
    ]);
    const bottom = render({ ladder: omens("Omen of Putrefaction") });
    expect(bottom.findAll("[data-divider]").map((d) => d.text())).toEqual([
      "1 ex",
    ]);
  });

  it("expands to the whole list and back", async () => {
    const wrapper = render();
    await wrapper.find("[data-expand]").trigger("click");
    expect(wrapper.findAll("[data-row]")).toHaveLength(38);
    expect(wrapper.findAll("[data-divider]").map((d) => d.text())).toEqual([
      "1 div",
      "1 ex",
    ]);
    expect(wrapper.emitted("expand")).toEqual([[true]]);
    await wrapper.find("[data-expand]").trigger("click");
    expect(wrapper.findAll("[data-row]")).toHaveLength(11);
  });

  it("switches to the drop group slot", async () => {
    const wrapper = render(
      {},
      { drop: '<div class="related-stub">Related items</div>' },
    );
    expect(wrapper.find(".related-stub").exists()).toBe(false);
    await wrapper.find('[data-tab="drop"]').trigger("click");
    expect(wrapper.find(".related-stub").text()).toBe("Related items");
    expect(wrapper.find("[data-row]").exists()).toBe(false);
    expect(wrapper.emitted("tab")).toEqual([["drop"]]);
    await wrapper.find('[data-tab="category"]').trigger("click");
    expect(wrapper.findAll("[data-row]")).toHaveLength(11);
  });

  it("has no tabs without a drop group", () => {
    expect(render().find("[data-tab]").exists()).toBe(false);
  });

  it("renders nothing for a non-exchange item", () => {
    expect(render({ ladder: null }).html()).toBe("<!--v-if-->");
    const empty = buildLadder({
      items: [],
      table: TABLE,
      core: "exalted",
      checked: "x",
    });
    expect(render({ ladder: empty }, { drop: "<div>drop</div>" }).html()).toBe(
      "<!--v-if-->",
    );
  });

  describe("keeps the priced item in view", () => {
    // happy-dom does no layout: rows are 28 px apart, the list shows 320 px.
    const ROW = 28;
    afterEach(() => vi.restoreAllMocks());

    function fakeLayout() {
      const proto = HTMLElement.prototype;
      vi.spyOn(proto, "offsetHeight", "get").mockReturnValue(ROW);
      vi.spyOn(proto, "clientHeight", "get").mockReturnValue(320);
      vi.spyOn(proto, "offsetTop", "get").mockImplementation(function (
        this: HTMLElement,
      ) {
        const rows = [...(this.parentElement?.children ?? [])].filter((el) =>
          el.hasAttribute("data-row"),
        );
        return rows.indexOf(this) * ROW;
      });
    }

    function scrollOf(wrapper: ReturnType<typeof render>) {
      return (wrapper.find("[data-row]").element.parentElement as HTMLElement)
        .scrollTop;
    }

    function centred(ladder: Ladder) {
      const index = ladder.rows.findIndex((r) => r.checked);
      return index * ROW - 320 / 2 + ROW / 2;
    }

    it("centres it when the list opens", async () => {
      fakeLayout();
      const ladder = omens("Omen of the Liege");
      const wrapper = render({ ladder });
      await wrapper.find("[data-expand]").trigger("click");
      await flushPromises();
      expect(scrollOf(wrapper)).toBe(centred(ladder));
    });

    it("re-centres on the next priced item while the list is open", async () => {
      fakeLayout();
      const wrapper = render({ ladder: omens("Omen of Light") });
      await wrapper.find("[data-expand]").trigger("click");
      await flushPromises();

      const next = omens("Omen of the Liege");
      await wrapper.setProps({ ladder: next });
      await flushPromises();
      expect(scrollOf(wrapper)).toBe(centred(next));
    });
  });
});
