import type { JourneyContext } from "@/shared/domain";
import { shuffle, hash } from "@/shared/random";
export function rewardPool(context: JourneyContext) {
  const rare =
    context.influence.heat >= 2 ||
    context.kind === "elite" ||
    context.kind === "boss";
  const pool =
    context.region === "forest"
      ? ["venom", "shelter", "guard", "focus", "miasma"]
      : context.region === "forge"
        ? ["strike", "guard", "burst", "fury", "pierce", "sweep"]
        : ["venom", "burst", "focus", "fury", "pierce", "miasma"];
  return shuffle(
    rare
      ? pool
      : [
          ...pool.filter((k) => !["burst", "fury", "sweep", "miasma"].includes(k)),
          "strike",
        ],
    hash(context.nodeId),
  ).slice(0, 3);
}
