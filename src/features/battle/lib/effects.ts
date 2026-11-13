import type { Actor, Effect } from "@/shared/domain";

/** 效果结算需要操作的敌人字段（同时兼容可变与深度只读来源）。 */
export interface EffectTarget extends Actor {
  id: string;
  name: string;
  rank: "front" | "back" | "summon";
  dead: boolean;
  thorns: number;
}

export interface EffectEvent {
  effect: Effect;
  source: "hero" | "enemy";
  label: string;
  /**
   * 目标稳定身份。单体/穿透效果在入队时锁定敌人 id；
   * 群攻（aoe）为 null，结算时对当前所有存活敌人生效；
   * 以 hero 为目标的效果同样为 null。
   */
  targetId: string | null;
}

/** 普通伤害：先扣格挡再扣生命。 */
export function damage(target: Actor, amount: number) {
  const blocked = Math.min(target.block, amount);
  target.block -= blocked;
  target.hp = Math.max(0, target.hp - (amount - blocked));
  return amount - blocked;
}

/** 穿透伤害：无视格挡直接作用于生命。 */
export function pierceDamage(target: Actor, amount: number) {
  target.hp = Math.max(0, target.hp - amount);
  return amount;
}

export interface ResolveResult {
  /** 结算日志行；效果被取消（单体目标已死亡）时为 null。 */
  log: string | null;
  /** 本次结算中被击杀的目标 id（用于掉落聚合等）。 */
  killedIds: string[];
  /** 反伤对旅人造成的伤害（0 表示未触发）。 */
  thornsToHero: number;
}

const emptyResult = (): ResolveResult => ({
  log: null,
  killedIds: [],
  thornsToHero: 0,
});

/**
 * 结算一个已入队效果。
 * - 单体效果（single/pierce）：目标提前死亡则取消，不会转火其他敌人；
 * - 群攻（aoe）：对所有存活敌人分别生效，单个目标死亡不影响其余目标；
 * - 穿透：伤害无视格挡；
 * - 反伤（荆棘）：仅由敌人受到的直接伤害触发，作用于来源（旅人）。
 */
export function resolveEffect(
  event: EffectEvent,
  hero: Actor,
  enemies: readonly EffectTarget[],
): ResolveResult {
  const { effect: e, source, label, targetId } = event;
  const result = emptyResult();

  // 以旅人为目标的效果。
  if (e.target === "hero") {
    if (e.type === "block") hero.block += e.amount;
    if (e.type === "strength") hero.strength += e.amount;
    if (e.type === "heal")
      hero.hp = Math.min(hero.maxHp, hero.hp + e.amount);
    result.log = `${label} → ${e.type} ${e.amount}`;
    return result;
  }

  const scope = e.scope ?? "single";
  const living = enemies.filter((en) => !en.dead && en.hp > 0);

  let targets: readonly EffectTarget[];
  if (scope === "aoe") {
    // 群攻：目标身份不固定，始终打当前存活者；无存活目标则整项取消。
    targets = living;
    if (!targets.length) {
      result.log = `${label} → 没有存活目标，效果消散`;
      return result;
    }
  } else {
    // 单体 / 穿透：按入队时锁定的稳定身份查找；死亡则取消，绝不转火。
    const target = enemies.find((en) => en.id === targetId);
    if (!target || target.dead || target.hp <= 0) {
      result.log = `${label} → 目标已经倒下，单体效果取消`;
      return result;
    }
    targets = [target];
  }

  const notes: string[] = [];

  for (const target of targets) {
    if (e.type === "damage") {
      const amount = e.amount + (source === "hero" ? hero.strength : 0);
      const lost =
        scope === "pierce"
          ? pierceDamage(target, amount)
          : damage(target, amount);
      notes.push(`${target.name} 失去 ${lost} 生命`);
      // 荆棘反伤：来源仍存活才触发；同归于尽时在 state 层按旅人死亡判负。
      if (target.thorns > 0 && source === "hero" && hero.hp > 0) {
        const thorns = damage(hero, target.thorns);
        result.thornsToHero += thorns;
        notes.push(`${target.name} 荆棘反伤 ${thorns}`);
      }
    } else if (e.type === "poison") {
      target.poison += e.amount;
      notes.push(`${target.name} 中毒 +${e.amount}`);
    } else if (e.type === "strength") {
      target.strength += e.amount;
      notes.push(`${target.name} 力量 +${e.amount}`);
    } else if (e.type === "heal") {
      target.hp = Math.min(target.maxHp, target.hp + e.amount);
      notes.push(`${target.name} 回复 ${e.amount}`);
    } else if (e.type === "block") {
      target.block += e.amount;
      notes.push(`${target.name} 格挡 +${e.amount}`);
    }
    if (target.hp <= 0 && !target.dead) {
      target.dead = true;
      result.killedIds.push(target.id);
      notes.push(`${target.name} 倒下`);
    }
  }

  result.log = `${label}${scope === "aoe" ? "（群攻）" : scope === "pierce" ? "（穿透）" : ""} → ${notes.join("；")}`;
  return result;
}

/** 中毒结算：返回损失生命；死亡由调用方标记。 */
export function poisonTick(actor: Actor) {
  if (actor.poison === 0) return 0;
  const amount = actor.poison;
  actor.hp = Math.max(0, actor.hp - amount);
  actor.poison = Math.max(0, actor.poison - 1);
  return amount;
}
