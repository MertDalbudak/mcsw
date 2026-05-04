<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { serverApi } from '@/api/endpoints';
import type { BanlistResponse } from '@/api/types';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';
import { useToastStore } from '@/stores/toasts';

const props = defineProps<{ instanceId: string; slot: string }>();
const players = ref<BanlistResponse | null>(null);
const ips = ref<BanlistResponse | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const toast = useToastStore();

async function load(): Promise<void> {
  loading.value = true;
  try {
    [players.value, ips.value] = await Promise.all([
      serverApi.banlist(props.instanceId, props.slot),
      serverApi.ipBanlist(props.instanceId, props.slot),
    ]);
    error.value = null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function unban(name: string): Promise<void> {
  if (!confirm(`Unban ${name}?`)) return;
  try {
    await serverApi.unban(props.instanceId, props.slot, name);
    toast.push(`Unbanned ${name}`, 'success');
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Unban failed', 'error');
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <Alert v-if="error" variant="error">{{ error }}</Alert>
    <div v-if="loading" class="flex justify-center py-8"><Spinner /></div>

    <section v-else class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
      <h2 class="text-lg font-semibold text-slate-100">Banned players</h2>
      <ul v-if="players?.players?.length" class="mt-4 divide-y divide-slate-800">
        <li v-for="b in players.players" :key="(b.uuid ?? '') + b.name" class="flex items-start gap-3 py-3">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-100">{{ b.name }}</p>
            <p v-if="b.reason" class="text-xs text-slate-400">{{ b.reason }}</p>
            <p class="text-xs text-slate-500">
              <template v-if="b.created">since {{ new Date(b.created).toLocaleDateString() }}</template>
              <template v-if="b.expires && b.expires !== 'forever'"> · expires {{ new Date(b.expires).toLocaleDateString() }}</template>
              <template v-else-if="b.expires === 'forever'"> · permanent</template>
            </p>
          </div>
          <button v-if="b.name" @click="unban(b.name)" class="text-xs text-emerald-400 hover:text-emerald-300">unban</button>
        </li>
      </ul>
      <p v-else class="mt-4 italic text-slate-500">No banned players.</p>
    </section>

    <section v-if="!loading" class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
      <h2 class="text-lg font-semibold text-slate-100">Banned IPs</h2>
      <ul v-if="ips?.ips?.length" class="mt-4 divide-y divide-slate-800">
        <li v-for="b in ips.ips" :key="(b.ip ?? '') + (b.created ?? '')" class="py-3">
          <p class="font-mono text-sm text-slate-100">{{ b.ip }}</p>
          <p v-if="b.reason" class="text-xs text-slate-400">{{ b.reason }}</p>
        </li>
      </ul>
      <p v-else class="mt-4 italic text-slate-500">No banned IPs.</p>
    </section>
  </div>
</template>
