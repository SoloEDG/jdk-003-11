import { reactive, readonly } from "vue";
import type {
  Actor,
  BattleResult,
  CardInstance,
  JourneyContext,
} from "@/shared/domain";
import { cards } from "@/shared/cards";
import { uid } from "@/shared/random";
import {
  spawnFormation,
  createSummon,
  enemyIntent,
  migrateLegacyEnemy,
  type Enemy,
  type EncounterFormation,
} from "../lib/enemies";
import { makePiles, drawCards, discardHand, type Piles } from "../lib/piles";
import {
  resolveEffect,
  poisonTick,
  damage,
  type EffectEvent,
} from "../lib/effects";
import {
  isEncounterWon,
  livingEnemies,
  pickLegalTarget,
} from "../lib/formation";

interface BattleState {
  id: string;
  context: JourneyContext | null;
  hero: Actor;
  /** 敌人阵形（最多三名），按稳定身份记录。 */
  formation: EncounterFormation | null;
  piles: Piles;
  energy: number;
  turn: number;
  phase: "idle" | "playing" | "won" | "lost";
  /** 待处理效果队列：单体效果已锁定 targetId，存档恢复后仍打同一敌人。 */
  queue: EffectEvent[];
  log: string[];
  result: BattleResult | null;
  /** 战斗中已经计入的掉落（含召唤物），胜负判定与存档恢复都保留。 */
  collectedGold: number;
}

const emptyHero = (): Actor => ({
  hp: 72,
  maxHp: 72,
  block: 0,
  strength: 0,
  poison: 0,
  thorns: 0,
});

const state = reactive<BattleState>({
  id: "",
  context: null,
  hero: emptyHero(),
  formation: null,
  piles: makePiles([], ""),
  energy: 3,
  turn: 1,
  phase: "idle",
  queue: [],
  log: [],
  result: null,
  collectedGold: 0,
});

/** 已发放掉落的敌人身份，保证每名敌人最多聚合一次（存档恢复后重建）。 */
const collectedIds = new Set<string>();

export const battleState = readonly(state);

/** 可变状态访问器，仅供模型内部流程与测试构造场景使用，UI 一律走只读 state。 */
export function mutableBattleState() {
  return state;
}

export function beginBattle(
  context: JourneyContext,
  deck: CardInstance[],
  hp: number,
  maxHp: number,
) {
  state.id = uid("battle");
  state.context = context;
  state.hero = { ...emptyHero(), hp, maxHp };
  state.formation = spawnFormation(context);
  state.piles = makePiles(deck, context.nodeId);
  state.energy = 3;
  state.turn = 1;
  state.phase = "playing";
  state.queue = [];
  state.result = null;
  state.collectedGold = 0;
  collectedIds.clear();
  state.log = [
    `战斗开始：${state.formation.enemies.length} 名敌人列阵，状态和牌堆仅属于本场遭遇。`,
  ];
  drawCards(state.piles, 5, 1);
}

/** 标记死亡并把掉落一次性计入 collectedGold（重复调用不重复发奖）。 */
function collectKill(enemy: Enemy) {
  if (enemy.hp > 0 || enemy.reward <= 0) return;
  if (!enemy.dead) {
    enemy.dead = true;
    state.log.unshift(
      `${enemy.name}${enemy.rank === "summon" ? "（召唤物）" : ""}倒下`,
    );
  }
  if (!collectedIds.has(enemy.id)) {
    collectedIds.add(enemy.id);
    state.collectedGold += enemy.reward;
    state.log.unshift(`${enemy.name} 掉落 ${enemy.reward} 金币已计入`);
  }
}

/**
 * 胜负判定。
 * 旅人死亡优先判负——即使反伤与最后一名敌人同归于尽也是失败；
 * 胜利要求所有“需要击败的敌人”倒下，召唤物死亡不构成完整遭遇胜利。
 */
function finish() {
  if (!state.formation || !state.context || state.phase !== "playing")
    return;
  for (const e of state.formation.enemies) collectKill(e);

  if (state.hero.hp <= 0) {
    state.phase = "lost";
  } else if (isEncounterWon(state.formation)) {
    state.phase = "won";
  } else {
    return;
  }

  state.result = {
    id: state.id,
    nodeId: state.context.nodeId,
    won: state.phase === "won",
    hp: state.hero.hp,
    gold: state.collectedGold,
    collectedGold: state.collectedGold,
    context: JSON.parse(JSON.stringify(state.context)),
  };
  state.queue = [];
}

function drain() {
  while (state.queue.length && state.phase === "playing") {
    const event = state.queue.shift()!;
    if (event.effect.type === "draw") {
      drawCards(state.piles, event.effect.amount, state.turn);
      state.log.unshift(`抽取 ${event.effect.amount} 张牌`);
    } else if (event.effect.type === "energy") {
      state.energy += event.effect.amount;
      state.log.unshift(`获得 ${event.effect.amount} 能量`);
    } else if (state.formation) {
      const r = resolveEffect(event, state.hero, state.formation.enemies);
      if (r.log) state.log.unshift(r.log);
      if (r.killedIds.length) {
        for (const killedId of r.killedIds) {
          const victim = state.formation.enemies.find(
            (en) => en.id === killedId,
          );
          if (victim) collectKill(victim);
        }
      }
    }
    finish();
  }
  state.log = state.log.slice(0, 24);
}

export function playCard(id: string) {
  if (state.phase !== "playing" || !state.formation) return false;
  const card = state.piles.hand.find((c) => c.id === id);
  if (!card) return false;
  const spec = cards[card.key]!;
  if (state.energy < spec.cost) return false;

  // 攻击牌先选合法目标；群攻不需要锁定身份，单体/穿透锁定稳定 id。
  const needsTarget = spec.effects.some((e) => e.target === "enemy");
  let targetId: string | null = null;
  if (needsTarget) {
    const hasAoE = spec.effects.some(
      (e) => (e.scope ?? "single") === "aoe",
    );
    if (!hasAoE) {
      targetId = pickLegalTarget(state.formation);
      if (!targetId) return false;
    }
  }

  state.energy -= spec.cost;
  state.piles.hand = state.piles.hand.filter((c) => c.id !== id);
  (spec.kind === "power" ? state.piles.exhaust : state.piles.discard).push(
    card,
  );

  state.queue.push(
    ...spec.effects.map((e) => ({
      effect: {
        ...e,
        amount: e.amount + (card.upgraded && e.type !== "energy" ? 2 : 0),
        scope: e.scope ?? "single",
      },
      source: "hero" as const,
      label: spec.name,
      targetId:
        e.target === "enemy" && (e.scope ?? "single") !== "aoe"
          ? targetId
          : null,
    })),
  );
  drain();
  return true;
}

/** 每个存活敌人的意图（按稳定 id 分别记录）。 */
export function enemyIntents(): Record<string, number> {
  if (!state.formation) return {};
  const out: Record<string, number> = {};
  for (const e of livingEnemies(state.formation)) {
    out[e.id] = enemyIntent(e, state.turn);
  }
  return out;
}

/** 当前单体攻击牌的合法目标 id（供 UI 高亮）。 */
export function legalTargetId(): string | null {
  return state.formation ? pickLegalTarget(state.formation) : null;
}

export function endTurn() {
  if (state.phase !== "playing" || !state.formation) return;
  const formation = state.formation;

  // 1. 所有敌人中毒结算（按身份逐个处理，召唤物同样生效）。
  for (const e of formation.enemies) {
    if (e.dead || e.hp <= 0) continue;
    const lost = poisonTick(e);
    if (lost) state.log.unshift(`${e.name} 中毒失去 ${lost} 生命`);
  }
  finish();
  if (state.phase !== "playing") return;

  // 2. 后排召唤：存活敌人不足三名且没有存活召唤物时，一名后排敌人补充召唤物。
  const alive = livingEnemies(formation);
  const hasSummon = alive.some((e) => e.rank === "summon");
  const summoner = alive.find((e) => e.rank === "back");
  if (summoner && !hasSummon && alive.length < 3 && state.context) {
    const summon = createSummon(state.context, summoner);
    formation.enemies.push(summon);
    state.log.unshift(`${summoner.name} 召唤了 ${summon.name}`);
  }

  // 3. 每个存活敌人分别按自己的意图攻击旅人。
  for (const e of livingEnemies(formation)) {
    const amount = enemyIntent(e, state.turn);
    damage(state.hero, amount);
    state.log.unshift(`${e.name} 攻击 ${amount}`);
    if (state.hero.hp <= 0) break;
  }
  poisonTick(state.hero);
  finish();
  if (state.phase !== "playing") return;

  // 4. 回合收尾：弃牌、重置能量与格挡、抽牌。
  discardHand(state.piles);
  state.turn++;
  state.energy = 3;
  state.hero.block = 0;
  for (const e of formation.enemies) {
    if (e.dead || e.hp <= 0) continue;
    e.block = state.turn % 3 === 0 ? 5 : 0;
  }
  drawCards(state.piles, 5, state.turn);
}

export function exportBattle() {
  return JSON.parse(JSON.stringify(state)) as BattleState;
}

export function restoreBattle(d: unknown) {
  const data = d as Partial<BattleState> & { enemy?: unknown };
  if (!data || typeof data !== "object" || !data.piles) return;

  // 旧单敌人存档迁移：补齐稳定 id 与阵形，单敌人战斗可继续。
  if (!data.formation && data.enemy) {
    const legacy = migrateLegacyEnemy(data.enemy);
    if (legacy) data.formation = legacy;
    // 旧队列没有 targetId：为单体敌人效果补绑唯一敌人 id。
    const onlyId = legacy?.enemies[0]?.id ?? null;
    data.queue = (data.queue ?? []).map((ev) => ({
      ...ev,
      effect: { ...ev.effect, scope: ev.effect.scope ?? "single" },
      targetId:
        ev.effect.target === "enemy" &&
        (ev.effect.scope ?? "single") !== "aoe"
          ? onlyId
          : ev.targetId ?? null,
    }));
  }

  if (!data.formation) return;
  // 确保所有敌人携带稳定身份与死亡标记。
  for (const e of data.formation.enemies) {
    if (!e.id) e.id = uid("enemy");
    if (typeof e.dead !== "boolean") e.dead = e.hp <= 0;
    if (e.rank !== "front" && e.rank !== "back" && e.rank !== "summon")
      e.rank = "front";
  }
  if (!Array.isArray(data.formation.requiredIds) || !data.formation.requiredIds.length) {
    data.formation.requiredIds = data.formation.enemies
      .filter((e) => e.rank !== "summon")
      .map((e) => e.id);
  }
  // 队列中的身份字段兜底。
  data.queue = (data.queue ?? []).map((ev) => ({
    ...ev,
    targetId: ev.targetId ?? null,
    effect: { ...ev.effect, scope: ev.effect.scope ?? "single" },
  }));
  if (typeof data.collectedGold !== "number") {
    data.collectedGold = data.result?.collectedGold ?? data.result?.gold ?? 0;
  }

  state.id = data.id ?? uid("battle");
  state.context = data.context ?? null;
  state.hero = data.hero ?? emptyHero();
  state.formation = data.formation;
  state.piles = data.piles;
  state.energy = data.energy ?? 3;
  state.turn = data.turn ?? 1;
  state.phase = data.phase ?? "idle";
  state.queue = data.queue;
  state.log = Array.isArray(data.log) ? data.log : [];
  state.result = data.result ?? null;
  state.collectedGold = data.collectedGold;
  // 重建已发放掉落身份：所有死亡敌人的奖励都已包含在 collectedGold 中。
  collectedIds.clear();
  for (const e of state.formation.enemies) {
    if (e.dead || e.hp <= 0) collectedIds.add(e.id);
  }
}

export function resetBattle() {
  state.phase = "idle";
  state.context = null;
  state.formation = null;
  state.result = null;
  state.piles = makePiles([], "");
  state.queue = [];
  state.log = [];
  state.collectedGold = 0;
  collectedIds.clear();
}
