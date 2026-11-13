export type Region = "forest" | "forge" | "abyss";
export type NodeKind = "battle" | "elite" | "shop" | "camp" | "boss";
export interface Influence {
  heat: number;
  favor: number;
  scarcity: number;
}
export interface RouteNode {
  id: string;
  region: Region;
  depth: number;
  lane: number;
  kind: NodeKind;
  title: string;
  influence: Influence;
  next: string[];
}
export interface CardInstance {
  id: string;
  key: string;
  upgraded: boolean;
}
export interface CardSpec {
  key: string;
  name: string;
  cost: number;
  kind: "attack" | "skill" | "power";
  text: string;
  rarity: "common" | "rare";
  effects: Effect[];
}
export type EffectScope = "single" | "aoe" | "pierce";
export type Effect = {
  type: "damage" | "block" | "draw" | "poison" | "strength" | "heal" | "energy";
  amount: number;
  target: "hero" | "enemy";
  /**
   * 作用范围：single 单体（按稳定身份绑定目标）、aoe 群攻（所有存活敌人）、
   * pierce 穿透（无视格挡的单体伤害，仍按身份绑定）。
   * 旧存档没有该字段，读取时按 single 处理。
   */
  scope?: EffectScope;
};
export interface Actor {
  hp: number;
  maxHp: number;
  block: number;
  strength: number;
  poison: number;
  thorns: number;
}
export interface JourneyContext {
  nodeId: string;
  region: Region;
  depth: number;
  kind: NodeKind;
  influence: Influence;
}
/** 敌人站位：front 前排、back 后排、summon 召唤物（不计入遭遇胜利条件）。 */
export type EnemyRank = "front" | "back" | "summon";
export interface BattleResult {
  id: string;
  nodeId: string;
  won: boolean;
  hp: number;
  /** 聚合后的金币：所有需要击败的敌人掉落之和。 */
  gold: number;
  /** 战斗过程中已经计入的掉落（含中途死亡的召唤物/敌人），保存恢复时原样保留。 */
  collectedGold: number;
  context: JourneyContext;
}
export interface RewardOffer {
  id: string;
  source: string;
  cards: string[];
  gold: number;
  heal: number;
  claimed: boolean;
}
export interface Purchase {
  id: string;
  card: string;
  price: number;
}
export interface ExpeditionSummary {
  hp: number;
  maxHp: number;
  gold: number;
  scars: number;
}
export const regionNames: Record<Region, string> = {
  forest: "苔光林地",
  forge: "熔铁边境",
  abyss: "无声深渊",
};
