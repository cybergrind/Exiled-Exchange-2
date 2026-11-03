// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UniqueRollBadge from "@/web/price-check/filters/UniqueRollBadge.vue";

describe("UniqueRollBadge", () => {
  it("names a key mod and its top roll in text", () => {
    const badge = mount(UniqueRollBadge, {
      props: {
        importance: "key",
        why: "Scales the build's damage",
        grade: "top",
        goodness: 0.9,
      },
    });
    const importance = badge.get("[data-unique-importance]");
    expect(importance.text()).toBe("Key mod");
    expect(importance.attributes("title")).toBe("Scales the build's damage");
    const grade = badge.get("[data-roll-grade]");
    expect(grade.text()).toBe("Top roll");
    expect(grade.attributes("title")).toBe("90% of the way up its range");
  });

  it("shows a roll grade on a mod nobody researched", () => {
    const badge = mount(UniqueRollBadge, { props: { grade: "perfect" } });
    expect(badge.find("[data-unique-importance]").exists()).toBe(false);
    expect(badge.get("[data-roll-grade]").text()).toBe("Perfect roll");
  });

  it("renders nothing without importance or grade", () => {
    expect(mount(UniqueRollBadge, { props: {} }).html()).not.toContain("span");
  });
});
