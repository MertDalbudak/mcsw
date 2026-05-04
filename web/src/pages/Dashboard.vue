<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { slotsApi } from '@/api/endpoints';
import type { FederatedSlot } from '@/api/types';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';
import StateBadge from '@/components/StateBadge.vue';
import {
  PlayIcon, StopIcon, ArrowPathIcon, UsersIcon, CpuChipIcon,
} from '@heroicons/vue/24/outline';

const slots = ref<FederatedSlot[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function refresh(): Promise<void> {
  try {
    const result = await slotsApi.list();
    slots.value = result.slots;
    error.value = null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load slots';
  } finally {
    loading.value = false;
  }
}

async function start(s: FederatedSlot): Promise<void> {
  if (!s.slot.mounted_server?.id) return;
  await slotsApi.start(s.instanceId, s.slot.name, s.slot.mounted_server.id).catch(() => undefined);
  refresh();
}
async function stop(s: FederatedSlot): Promise<void> {
  await slotsApi.stop(s.instanceId, s.slot.name).catch(() => undefined);
  refresh();
}
async function restart(s: FederatedSlot): Promise<void> {
  await slotsApi.restart(s.instanceId, s.slot.name).catch(() => undefined);
  refresh();
}

onMounted(() => {
  refresh();
  // Poll while we don't have a federation-level WS. Per-slot detail page
  // uses the events WS for sub-second updates.
  pollTimer = setInterval(refresh, 5_000);
});
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold tracking-tight text-slate-100">Servers</h1>
      <button @click="refresh" class="text-sm text-slate-400 hover:text-slate-200">Refresh</button>
    </div>

    <Alert v-if="error" variant="error">{{ error }}</Alert>

    <div v-if="loading && slots.length === 0" class="flex justify-center py-16">
      <Spinner size="lg" />
    </div>
    <div v-else-if="slots.length === 0" class="rounded-2xl bg-slate-900/40 p-12 text-center ring-1 ring-slate-800">
      <CpuChipIcon class="mx-auto h-10 w-10 text-slate-600" />
      <p class="mt-3 text-slate-400">No accessible slots.</p>
      <p class="mt-1 text-sm text-slate-500">Ask an admin to grant you access to a server.</p>
    </div>

    <ul v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="s in slots" :key="`${s.instanceId}:${s.slot.name}`"
        class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800 hover:ring-slate-700"
      >
        <div class="flex items-start justify-between">
          <div class="min-w-0">
            <p class="truncate text-xs uppercase tracking-wider text-slate-500">{{ s.instanceName }}</p>
            <p class="truncate text-lg font-semibold text-slate-100">{{ s.slot.name }}</p>
          </div>
          <StateBadge :state="s.slot.state" />
        </div>

        <div class="mt-3 min-h-[3rem]">
          <p v-if="s.slot.mounted_server" class="truncate text-sm text-slate-300">
            {{ s.slot.mounted_server.name }}
            <span class="text-slate-500">·</span>
            <span class="text-slate-500">{{ s.slot.mounted_server.type }} {{ s.slot.mounted_server.version }}</span>
          </p>
          <p v-else class="text-sm text-slate-500 italic">No server mounted</p>
          <p v-if="s.slot.mounted_server?.slp?.players" class="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
            <UsersIcon class="h-4 w-4" />
            {{ s.slot.mounted_server.slp.players.online }} / {{ s.slot.mounted_server.slp.players.max }}
          </p>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-if="s.canControl && (s.slot.state === 'idle' || s.slot.state === 'crashed' || s.slot.state === 'error')"
            @click="start(s)"
            class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20"
          >
            <PlayIcon class="h-4 w-4" /> Start
          </button>
          <button
            v-if="s.canControl && s.slot.state === 'running'"
            @click="restart(s)"
            class="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 ring-1 ring-amber-500/30 hover:bg-amber-500/20"
          >
            <ArrowPathIcon class="h-4 w-4" /> Restart
          </button>
          <button
            v-if="s.canControl && (s.slot.state === 'running' || s.slot.state === 'starting')"
            @click="stop(s)"
            class="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-1.5 text-sm text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/20"
          >
            <StopIcon class="h-4 w-4" /> Stop
          </button>
          <RouterLink
            :to="{ name: 'slot', params: { instanceId: s.instanceId, slot: s.slot.name } }"
            class="ml-auto inline-flex items-center text-sm text-slate-400 hover:text-slate-200"
          >
            Open →
          </RouterLink>
        </div>
      </li>
    </ul>
  </div>
</template>
