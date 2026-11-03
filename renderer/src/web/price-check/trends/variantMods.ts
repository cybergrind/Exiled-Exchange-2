// The parser's stats in the shape variantNote.ts reads.
import {
  ModifierType,
  statSourcesTotal,
  translateStatWithRoll,
} from "@/parser/modifiers";
import type { StatCalculated } from "@/parser/modifiers";
import type { VariantModInput } from "./variantNote";

/** A stat as the variant note reads it: its text with the roll filled in. */
export function variantModInput(calc: StatCalculated): VariantModInput {
  const option = Boolean(calc.stat.trade.option);
  const roll = option
    ? calc.sources[0]?.contributes
    : statSourcesTotal(calc.sources);
  let text = translateStatWithRoll(calc, roll).string;
  if (!option && roll && text.split("#").length === 2) {
    text = text.replace("#", String(+Math.abs(roll.value).toFixed(2)));
  }
  return {
    ref: calc.stat.ref,
    text,
    option,
    type:
      calc.type === ModifierType.Explicit
        ? "explicit"
        : calc.type === ModifierType.Implicit
          ? "implicit"
          : "other",
  };
}
