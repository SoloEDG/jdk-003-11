<script setup lang="ts">
import { computed } from "vue";
import {
  battleState,
  enemyIntents,
  legalTargetId,
} from "../model/state";
import { cards } from "@/shared/cards";
import { orderedEnemies } from "../lib/formation";
import ActorCard from "./ActorCard.vue";

defineEmits<{ play: [id: string]; end: []; settle: [] }>();

const enemies = computed(() =>
  battleState.formation ? orderedEnemies(battleState.formation) : [],
);
const intents = computed(() => enemyIntents());
const targetId = computed(() => legalTargetId());
const formationTitle = computed(() =>
  enemies.value.map((e) => e.name).join("、") || "等待下一场遭遇",
);
</script>
<template>
  <section class="panel battle-panel">
    <div class="section-top">
      <span class="eyebrow">02 / THE ENCOUNTER</span
      ><span>回合 {{ battleState.turn }}</span>
    </div>
    <h2>{{ formationTitle }}</h2>
    <div v-if="enemies.length" class="arena arena-formation">
      <ActorCard :actor="battleState.hero" name="余烬旅人" />
      <div class="versus">
        VS<br /><small>{{ battleState.context?.region.toUpperCase() }}</small>
      </div>
      <div class="enemy-line">
        <ActorCard
          v-for="e in enemies"
          :key="e.id"
          :actor="e"
          :name="e.name"
          enemy
          :rank="e.rank"
          :intent="intents[e.id]"
          :legal-target="targetId === e.id"
        />
      </div>
    </div>
    <div v-else class="empty-art">
      ✧
      <p>在路线图中选择一个哨站<br /><small>每次出牌都可能改变战局</small></p>
    </div>
    <div v-if="battleState.phase === 'playing'">
      <div class="energy-line">
        <b>◉ {{ battleState.energy }} / 3 能量</b
        ><span
          >抽牌 {{ battleState.piles.draw.length }} · 弃牌
          {{ battleState.piles.discard.length }} · 消耗
          {{ battleState.piles.exhaust.length }}</span
        ><button data-action="end-turn" @click="$emit('end')">
          结束回合 →
        </button>
      </div>
      <p v-if="targetId" class="target-rule">
        攻击牌将优先锁定标注“合法目标”的前排敌人；群攻作用于所有存活敌人。
      </p>
      <div class="hand">
        <button
          v-for="c in battleState.piles.hand"
          :key="c.id"
          class="playing-card"
          :data-hand-id="c.id"
          :disabled="cards[c.key]!.cost > battleState.energy"
          @click="$emit('play', c.id)"
        >
          <i>{{ cards[c.key]!.cost }}</i
          ><span>{{
            cards[c.key]!.kind === "attack"
              ? "⚔"
              : cards[c.key]!.kind === "power"
                ? "✺"
                : "◇"
          }}</span>
          <h3>{{ cards[c.key]!.name }}{{ c.upgraded ? " +" : "" }}</h3>
          <p>{{ cards[c.key]!.text }}<b v-if="c.upgraded"> 效果 +2</b></p>
          <small>{{ cards[c.key]!.kind.toUpperCase() }}</small>
        </button>
      </div>
    </div>
    <div
      v-if="battleState.phase === 'won' || battleState.phase === 'lost'"
      class="notice"
    >
      <h3>
        {{
          battleState.phase === "won"
            ? "遭遇胜利 · 火种仍在"
            : "旅途结束 · 余烬熄灭"
        }}
      </h3>
      <p v-if="battleState.phase === 'won'" class="muted">
        阵形击破，已计入掉落 {{ battleState.collectedGold }} 金币。
      </p>
      <button data-action="settle" @click="$emit('settle')">
        {{ battleState.phase === "won" ? "收取战利品 →" : "查看旅程结果" }}
      </button>
    </div>
    <details v-if="battleState.log.length" open>
      <summary>效果记录 · 最新在前</summary>
      <div class="battle-log">
        <p v-for="(line, i) in battleState.log" :key="i">{{ line }}</p>
      </div>
    </details>
  </section>
</template>
