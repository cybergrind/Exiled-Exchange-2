// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

describe("component test environment", () => {
  it("mounts a Vue component into a DOM", () => {
    const Probe = defineComponent({
      props: { label: { type: String, required: true } },
      setup: (props) => () => h("span", { class: "probe" }, props.label),
    });
    const wrapper = mount(Probe, { props: { label: "ok" } });
    expect(wrapper.find(".probe").text()).toBe("ok");
  });
});
