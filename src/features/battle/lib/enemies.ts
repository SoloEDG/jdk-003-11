import type { Actor, EnemyRank, JourneyContext } from "@/shared/domain";
import { uid } from "@/shared/random";

export interface Enemy extends Actor {
  /** 稳定身份：一旦生成不再随站位/数组位置变化，效果队列按此 id 绑定目标。 */
  id: string;
  name: string;
  attack: number;
  reward: number;
  pattern: number[];
  rank: EnemyRank;
  /** 召唤者 id（仅召唤物有值）。 */
  summonedBy?: string;
  dead: boolean;
}

export interface EncounterFormation {
  /** 按稳定身份保存全部敌人（含已死亡），不依赖数组位置。 */
  enemies: Enemy[];
  /** 本阵需要击败的敌人 id（前/后排）；召唤物不在其中。 */
  requiredIds: string[];
}

type EnemyTemplate = Pick<
  Enemy,
  "name" | "attack" | "reward" | "pattern" | "thorns"
> & { hp: number; strength: number };

function baseEnemy(
  c: JourneyContext,
  name: string,
  hp: number,
  attack: number,
  reward: number,
  pattern: number[],
  rank: EnemyRank,
  strength = 0,
  thorns = 0,
): Enemy {
  return {
    id: uid("enemy"),
    name,
    hp,
    maxHp: hp,
    block: 0,
    strength,
    poison: 0,
    thorns,
    attack,
    reward,
    pattern,
    rank,
    dead: false,
  };
}

function regionName(c: JourneyContext) {
  return c.region === "forest"
    ? "孢冠巡游者"
    : c.region === "forge"
      ? "熔炉卫兵"
      : "空洞回声";
}

/** 阵形规格：最多三名敌人，front 前排 / back 后排 / summon 召唤物。 */
export function spawnFormation(c: JourneyContext): EncounterFormation {
  const elite = c.kind === "elite";
  const boss = c.kind === "boss";
  const heat = c.influence.heat;
  const enemies: Enemy[] = [];

  if (boss) {
    // Boss：一名首领 + 一名后排祭司（最多三名的余量预留给召唤物）。
    const leader = baseEnemy(
      c,
      "裂隙守望者",
      80 + c.depth * 4 + heat * 2,
      9 + Math.floor(c.depth / 2),
      40 + heat * 3,
      [1.5, 0.7, 1.2],
      "front",
      Math.floor(heat / 2),
      0,
    );
    const priest = baseEnemy(
      c,
      "深渊低语者",
      34 + c.depth * 3 + heat,
      4 + Math.floor(c.depth / 3),
      16 + heat * 2,
      [0.8, 1.1, 0.6],
      "back",
      Math.floor(heat / 3),
      0,
    );
    enemies.push(leader, priest);
  } else if (elite) {
    // 精英：前排两名卫兵。
    for (let i = 0; i < 2; i++) {
      enemies.push(
        baseEnemy(
          c,
          regionName(c),
          40 + c.depth * 4 + heat * 2,
          8 + Math.floor(c.depth / 2),
          28 + heat * 3,
          [1, 0.7, 1.3],
          "front",
          Math.floor(heat / 2),
          c.region === "forge" ? 1 : 0,
        ),
      );
    }
  } else {
    // 普通战斗：前排一名 + 后排一名；林地遭遇额外带一只召唤孢子。
    enemies.push(
      baseEnemy(
        c,
        regionName(c),
        25 + c.depth * 4 + heat * 2,
        5 + Math.floor(c.depth / 2),
        18 + heat * 3,
        [1, 0.7, 1.3],
        "front",
        Math.floor(heat / 2),
        c.region === "forge" ? 1 : 0,
      ),
    );
    enemies.push(
      baseEnemy(
        c,
        c.region === "forest" ? "苔影伏兵" : regionName(c),
        20 + c.depth * 3 + heat,
        4 + Math.floor(c.depth / 3),
        14 + heat * 2,
        [0.9, 1.2, 0.7],
        "back",
        Math.floor(heat / 3),
        0,
      ),
    );
    if (c.region === "forest" && enemies.length < 3) {
      const spore = baseEnemy(
        c,
        "游荡孢子",
        12 + c.depth * 2,
        3,
        6,
        [0.8, 0.8, 0.8],
        "summon",
        0,
        0,
      );
      spore.summonedBy = enemies[0]!.id;
      enemies.push(spore);
    }
  }

  return {
    enemies,
    requiredIds: enemies
      .filter((e) => e.rank !== "summon")
      .map((e) => e.id),
  };
}

/** 战斗中由后排敌人召唤新的召唤物（稳定 id，追加而非插入）。 */
export function createSummon(
  c: JourneyContext,
  master: { id: string },
): Enemy {
  const summon = baseEnemy(
    c,
    "裂隙残影",
    10 + c.depth * 2,
    3 + Math.floor(c.depth / 4),
    6,
    [0.9, 0.9, 0.9],
    "summon",
    0,
    0,
  );
  summon.summonedBy = master.id;
  return summon;
}

type IntentSource = {
  attack: number;
  pattern: readonly number[];
  strength: number;
};

export function enemyIntent(enemy: IntentSource, turn: number) {
  return (
    Math.floor(
      enemy.attack * enemy.pattern[(turn - 1) % enemy.pattern.length]!,
    ) + enemy.strength
  );
}

/** 兼容旧单敌人存档：把旧结构补齐为阵形。 */
export function migrateLegacyEnemy(raw: unknown): EncounterFormation | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Enemy>;
  if (typeof e.hp !== "number" || typeof e.maxHp !== "number") return null;
  const enemy: Enemy = {
    id: typeof e.id === "string" ? e.id : uid("enemy"),
    name: String(e.name ?? "旧日敌人"),
    hp: e.hp,
    maxHp: e.maxHp,
    block: e.block ?? 0,
    strength: e.strength ?? 0,
    poison: e.poison ?? 0,
    thorns: e.thorns ?? 0,
    attack: e.attack ?? 5,
    reward: e.reward ?? 18,
    pattern: Array.isArray(e.pattern) ? e.pattern : [1, 0.7, 1.3],
    rank: "front",
    dead: e.hp <= 0,
  };
  return { enemies: [enemy], requiredIds: [enemy.id] };
}
