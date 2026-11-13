<script setup lang="ts">
import type { Actor, EnemyRank } from "@/shared/domain";
defineProps<{
  actor: Actor;
  name: string;
  enemy?: boolean;
  intent?: number;
  rank?: EnemyRank;
  legalTarget?: boolean;
  dead?: boolean;
}>();
const rankLabel: Record<EnemyRank, string> = {
  front: "前排",
  back: "后排",
  summon: "召唤物",
};
</script>
<template>
  <div
    class="actor"
    :class="{
      enemy,
      target: legalTarget,
      summon: rank === 'summon',
      fallen: dead,
    }"
  >
    <div class="actor-sigil">{{ enemy ? "♜" : "✦" }}</div>
    <h3>
      {{ name }}
      <small v-if="enemy && rank" class="rank-tag">{{ rankLabel[rank] }}</small>
    </h3>
    <div class="health">
      <i :style="{ width: (actor.hp / actor.maxHp) * 100 + '%' }"></i>
    </div>
    <p>
      {{ actor.hp }} / {{ actor.maxHp }} HP
      <span v-if="actor.block"> · 护盾 {{ actor.block }}</span>
    </p>
    <div class="statuses">
      <span v-if="actor.strength">力量 {{ actor.strength }}</span
      ><span v-if="actor.poison">中毒 {{ actor.poison }}</span
      ><span v-if="actor.thorns">荆棘 {{ actor.thorns }}</span>
    </div>
    <strong v-if="enemy && !dead" class="intent"
      >下次攻击 {{ intent ?? 0 }}</strong
    >
    <em v-if="legalTarget" class="target-hint">合法目标</em>
  </div>
</template>
