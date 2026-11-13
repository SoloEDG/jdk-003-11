import type { EnemyRank } from "@/shared/domain";
import type { Enemy } from "./enemies";

/** Vue readonly() 产生的深度只读敌人形态。 */
export type ReadonlyEnemy = Omit<Enemy, "pattern"> & {
  readonly pattern: readonly number[];
};

export type FormationView = {
  enemies: readonly ReadonlyEnemy[];
  requiredIds: readonly string[];
};

/** 存活敌人（按稳定 id 保存，顺序只用于展示）。 */
export function livingEnemies(formation: FormationView): ReadonlyEnemy[] {
  return formation.enemies.filter((e) => !e.dead && e.hp > 0);
}

const rankOrder: Record<EnemyRank, number> = {
  front: 0,
  back: 1,
  summon: 2,
};

/**
 * 展示顺序：前排 → 后排 → 召唤物。前排死亡后后排自然补位到最前，
 * 但每个敌人的 id 不变，已排队效果仍按 id 命中原目标。
 */
export function orderedEnemies(formation: FormationView): ReadonlyEnemy[] {
  return [...formation.enemies]
    .filter((e) => !e.dead && e.hp > 0)
    .sort((a, b) => rankOrder[a.rank] - rankOrder[b.rank]);
}

/**
 * 攻击牌选择合法目标：只能打前排；没有前排时后排补位成为合法目标；
 * 召唤物只有在没有任何前/后排存活时才可被选为单体目标。
 * 返回稳定 id；没有合法目标返回 null。
 */
export function pickLegalTarget(formation: FormationView): string | null {
  const alive = livingEnemies(formation);
  if (!alive.length) return null;
  const front = alive.find((e) => e.rank === "front");
  if (front) return front.id;
  const back = alive.find((e) => e.rank === "back");
  if (back) return back.id;
  return alive[0]!.id;
}

/** 召唤物死亡不算胜利：只有所有需要击败的敌人都倒下才胜利。 */
export function isEncounterWon(formation: FormationView): boolean {
  return formation.requiredIds.every((id) => {
    const e = formation.enemies.find((x) => x.id === id);
    return !e || e.dead || e.hp <= 0;
  });
}

/** 仍需击败且存活的敌人。 */
export function requiredLiving(formation: FormationView): ReadonlyEnemy[] {
  return formation.enemies.filter(
    (e) =>
      formation.requiredIds.includes(e.id) && !e.dead && e.hp > 0,
  );
}
