<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { serverApi } from '@/api/endpoints';
import type { PlayerDto } from '@/api/types';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';
import { useToastStore } from '@/stores/toasts';

const props = defineProps<{ instanceId: string; slot: string }>();
const players = ref<PlayerDto[]>([]);
const max = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);
const toast = useToastStore();

async function refresh(): Promise<void> {
  try {
    const r = await serverApi.players(props.instanceId, props.slot);
    players.value = r.players;
    max.value = r.max;
    error.value = null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load players';
  } finally {
    loading.value = false;
  }
}

async function call(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    toast.push(`${label} succeeded`, 'success');
    refresh();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : `${label} failed`, 'error');
  }
}

function kick(p: PlayerDto): void {
  const reason = prompt(`Kick reason for ${p.name}:`, '') ?? '';
  if (reason === null) return;
  call('Kick', () => serverApi.kick(props.instanceId, props.slot, p.name, reason || undefined));
}
function ban(p: PlayerDto): void {
  const reason = prompt(`Ban reason for ${p.name}:`, '') ?? '';
  const duration = prompt('Duration (e.g. 7d, 24h, blank=permanent):', '') ?? '';
  call('Ban', () => serverApi.ban(props.instanceId, props.slot, p.name, {
    reason: reason || undefined,
    duration: duration || undefined,
  }));
}
function op(p: PlayerDto): void {
  call('Op', () => serverApi.op(props.instanceId, props.slot, p.name));
}
function deop(p: PlayerDto): void {
  call('De-op', () => serverApi.deop(props.instanceId, props.slot, p.name));
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { refresh(); timer = setInterval(refresh, 5000); });
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <div class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-100">Players</h2>
      <span class="text-sm text-slate-400">{{ players.length }} / {{ max }}</span>
    </div>
    <Alert v-if="error" variant="error" class="mt-4">{{ error }}</Alert>
    <div v-if="loading" class="flex justify-center py-8"><Spinner /></div>
    <p v-else-if="players.length === 0" class="mt-4 italic text-slate-500">No players online.</p>
    <ul v-else class="mt-4 divide-y divide-slate-800">
      <li v-for="p in players" :key="p.name" class="flex items-center gap-3 py-3">
        <img v-if="p.uuid" :src="`https://crafatar.com/avatars/${p.uuid}?size=32&overlay`" :alt="p.name"
             class="h-8 w-8 rounded-md ring-1 ring-slate-700" />
        <div v-else class="h-8 w-8 rounded-md bg-slate-800" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-slate-100">{{ p.name }}</p>
          <p v-if="p.ping_ms != null" class="text-xs text-slate-500">{{ p.ping_ms }} ms</p>
        </div>
        <div class="flex flex-wrap justify-end gap-2 text-xs">
          <button @click="kick(p)"  class="text-amber-400 hover:text-amber-300">kick</button>
          <button @click="ban(p)"   class="text-rose-400 hover:text-rose-300">ban</button>
          <button @click="op(p)"    class="text-emerald-400 hover:text-emerald-300">op</button>
          <button @click="deop(p)"  class="text-slate-400 hover:text-slate-200">deop</button>
        </div>
      </li>
    </ul>
  </div>
</template>
