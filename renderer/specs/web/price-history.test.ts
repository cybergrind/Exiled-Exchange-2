// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import {
  historyPoint,
  mergeHistory,
  parseHistory,
  serializePoint,
} from "@/web/background/market/history.ts";
import { aggregatePairs } from "@/web/background/market/cx.ts";
import {
  formatCount,
  formatRange,
  formatRate,
} from "@/web/background/market/format.ts";
import { cxHour, cxHourIds } from "./market/prices-harness";

// The chart library needs a real canvas; the stub keeps what it was given.
vi.mock("vue3-apexcharts", () => ({
  default: defineComponent({
    name: "ApexStub",
    props: ["type", "options", "series", "height"],
    setup: (props) => () => h("div", { "data-chart": props.type }),
  }),
}));

const { default: PriceHistory } = await import(
  "@/web/price-check/trends/PriceHistory.vue"
);

// WP-31, over the six recorded hours of Arcanist's Etcher.
const LEAGUE = "Forbidden Rites";
const ETCHER = "Metadata/Items/Currency/CurrencyMagicQuality";
const HOURS = cxHourIds();
const NEWEST = HOURS.at(-1)!;
const NOW = (NEWEST + 2 * 3600) * 1000;
const DAY = 86400;

function line(hour: number, at = hour) {
  const table = aggregatePairs(
    [{ hour, digest: JSON.parse(cxHour(hour)) }],
    LEAGUE,
  );
  return serializePoint(historyPoint(at, table));
}

function points(lines: string[]) {
  return parseHistory(mergeHistory("", lines.join("\n"), NOW).text).points;
}

const RECORDED = points(HOURS.map((h) => line(h)));

function render(props: Record<string, unknown> = {}) {
  return mount(PriceHistory, {
    props: {
      points: RECORDED,
      pairId: ETCHER,
      quote: "exalted",
      nowMs: NOW,
      ...props,
    },
  });
}

function charts(wrapper: ReturnType<typeof render>) {
  return wrapper.findAllComponents({ name: "ApexStub" });
}

describe("PriceHistory", () => {
  it("draws the low–high band and the typical rate of the pair", () => {
    const [price] = charts(render());
    const series = price.props("series") as Array<{
      type: string;
      data: Array<{ x: number; y: number | number[] }>;
    }>;
    const newest = JSON.parse(line(NEWEST)).pairs[ETCHER].exalted;
    const band = series.find((s) => s.type === "rangeArea")!;
    const typical = series.find((s) => s.type === "line")!;
    expect(band.data).toHaveLength(HOURS.length);
    expect(band.data.at(-1)).toEqual({
      x: NEWEST * 1000,
      y: [newest[1], newest[2]],
    });
    expect(typical.data.at(-1)).toEqual({ x: NEWEST * 1000, y: newest[0] });
  });

  it("shows the traded volume under the price", () => {
    const [, volume] = charts(render());
    expect(volume.props("type")).toBe("bar");
    const [bars] = volume.props("series") as Array<{
      data: Array<{ x: number; y: number }>;
    }>;
    const newest = JSON.parse(line(NEWEST)).pairs[ETCHER].exalted;
    expect(bars.data.at(-1)).toEqual({ x: NEWEST * 1000, y: newest[3] });
  });

  it("switches between 24 h, 7 d and everything kept", async () => {
    const today = Math.floor(NEWEST / DAY) * DAY;
    const wrapper = render({
      points: points([
        line(HOURS[0], today - 10 * DAY + 3600),
        line(HOURS[1], NEWEST - 3 * DAY),
        line(HOURS[2], NEWEST - 3600),
        line(NEWEST),
      ]),
    });
    const count = () =>
      (charts(wrapper)[0].props("series") as Array<{ data: unknown[] }>)[0].data
        .length;
    expect(wrapper.find('[data-range="7d"]').classes()).toContain("active");
    expect(count()).toBe(3);
    await wrapper.find('[data-range="24h"]').trigger("click");
    expect(count()).toBe(2);
    await wrapper.find('[data-range="all"]').trigger("click");
    expect(count()).toBe(4);
  });

  it("disables a range with fewer than two points", () => {
    const wrapper = render({
      points: points([
        line(HOURS[0], NEWEST - 3 * DAY),
        line(HOURS[1], NEWEST - 2 * DAY),
      ]),
    });
    expect(
      wrapper.find('[data-range="24h"]').attributes("disabled"),
    ).toBeDefined();
    expect(
      wrapper.find('[data-range="7d"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("offers each pair the item has history on", async () => {
    const wrapper = render();
    const quotes = wrapper.findAll("[data-quote]").map((b) => b.text());
    expect(quotes).toEqual(["Exalted", "Chaos", "Divine"]);
    await wrapper.find('[data-quote="chaos"]').trigger("click");
    const series = charts(wrapper)[0].props("series") as Array<{
      type: string;
      data: Array<{ y: number }>;
    }>;
    const newest = JSON.parse(line(NEWEST)).pairs[ETCHER].chaos;
    expect(series.find((s) => s.type === "line")!.data.at(-1)!.y).toBe(
      newest[0],
    );
  });

  it("fits the price axis to the band, not to zero", () => {
    const [price] = charts(render());
    const { min, max } = price.props("options").yaxis;
    const series = price.props("series") as Array<{
      type: string;
      data: Array<{ y: number[] }>;
    }>;
    const band = series.find((s) => s.type === "rangeArea")!.data;
    const low = Math.min(...band.map((p) => p.y[0]));
    const high = Math.max(...band.map((p) => p.y[1]));
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThanOrEqual(low);
    expect(max).toBeGreaterThanOrEqual(high);
    expect(max).toBeLessThan(high * 1.5);
  });

  it("scales the volume bars to the busiest period", () => {
    const [, volume] = charts(render());
    const [bars] = volume.props("series") as Array<{
      data: Array<{ y: number }>;
    }>;
    const { max } = volume.props("options").yaxis;
    expect(max).toBe(Math.max(...bars.data.map((b) => b.y)));
  });

  it("writes ranges short enough to stay on one line", () => {
    const labels = render()
      .findAll("[data-range]")
      .map((b) => b.text());
    expect(labels).toEqual(["24h", "7d", "All"]);
  });

  it("shows one tooltip per chart with the whole hour in it", () => {
    const [price, volume] = charts(render());
    const newest = JSON.parse(line(NEWEST)).pairs[ETCHER].exalted;
    const last = HOURS.length - 1;
    for (const chart of [price, volume]) {
      const options = chart.props("options");
      // Linked charts each raise a tooltip, and they overlap.
      expect(options.chart.group).toBeUndefined();
      const html: string = options.tooltip.custom({ dataPointIndex: last });
      expect(html).toContain(formatRate(newest[0]));
      expect(html).toContain(formatRange(newest[1], newest[2]));
      expect(html).toContain(formatCount(newest[3]));
    }
  });

  it("offers a longer range only when it shows more than the shorter one", () => {
    // All recorded hours fall within a day: 7 d and all would repeat 24 h.
    const wrapper = render();
    const enabled = (id: string) =>
      wrapper.find(`[data-range="${id}"]`).attributes("disabled") === undefined;
    expect(enabled("24h")).toBe(true);
    expect(enabled("7d")).toBe(false);
    expect(enabled("all")).toBe(false);
    expect(wrapper.find('[data-range="24h"]').classes()).toContain("active");
  });

  it("keeps the poe.ninja link when there is one", async () => {
    expect(render().find("[data-ninja]").exists()).toBe(false);
    const wrapper = render({ ninja: true });
    await wrapper.find("[data-ninja]").trigger("click");
    expect(wrapper.emitted("ninja")).toHaveLength(1);
  });
});
