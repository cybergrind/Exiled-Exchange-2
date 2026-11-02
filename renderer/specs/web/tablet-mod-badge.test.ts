// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TabletModBadge from "@/web/price-check/tablets/TabletModBadge.vue";

describe("TabletModBadge", () => {
  it("names the tier in text and explains the roll", () => {
    const badge = mount(TabletModBadge, {
      props: {
        rating: { tier: "good", short: "Omen chance", range: [35, 70] },
        roll: 0.5,
      },
    });
    expect(badge.text()).toBe("Good");
    expect(badge.attributes("data-tier")).toBe("good");
    expect(badge.attributes("title")).toBe(
      "Good: Omen chance. Rolls 35–70; this one is 50% of the way up.",
    );
  });

  it("leaves the roll out when the mod has no range", () => {
    const badge = mount(TabletModBadge, {
      props: { rating: { tier: "money", short: "Pit rewards" } },
    });
    expect(badge.text()).toBe("Always money");
    expect(badge.attributes("title")).toBe("Always money: Pit rewards.");
  });
});
