<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { systemApi } from '@/api/endpoints';
import type { SystemOverview } from '@/api/types';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';
import { ApiError } from '@/api/client';

const data = ref<SystemOverview | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

async function load(): Promise<void> {
  try {
    data.value = await systemApi.overview();
    error.value = null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load';
  } finally {
    loading.value = false;
  }
}

function fmtBytes(n?: number): string {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

function isError<T>(v: T | { _error: string }): v is { _error: string } {
  return v != null && typeof v === 'object' && '_error' in (v as object);
}

onMounted(() => { load(); timer = setInterval(load, 15_000); });
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold tracking-tight text-slate-100">System</h1>
      <button @click="load" class="text-sm text-slate-400 hover:text-slate-200">Refresh</button>
    </div>

    <Alert v-if="error" variant="error">{{ error }}</Alert>
    <div v-if="loading && !data" class="flex justify-center py-12"><Spinner size="lg" /></div>

    <ul v-else-if="data" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <li v-for="i in data.instances" :key="i.instanceId"
          class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
        <header class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-100">{{ i.name }}</h2>
          <span class="truncate text-xs text-slate-500">{{ i.baseUrl }}</span>
        </header>

        <!-- Resources -->
        <section class="mt-4">
          <h3 class="text-xs uppercase tracking-wider text-slate-500">Resources</h3>
          <Alert v-if="isError(i.resources)" variant="warn" class="mt-2">
            {{ i.resources._error }}
          </Alert>
          <dl v-else class="mt-2 grid grid-cols-2 gap-y-1 text-sm text-slate-300">
            <dt class="text-slate-500">CPU cores</dt><dd>{{ i.resources.cpu.cores }}</dd>
            <template v-if="i.resources.cpu.used_pct != null">
              <dt class="text-slate-500">CPU used</dt><dd>{{ i.resources.cpu.used_pct.toFixed(1) }}%</dd>
            </template>
            <template v-if="i.resources.mem">
              <dt class="text-slate-500">Memory</dt>
              <dd>{{ fmtBytes(i.resources.mem.used_bytes) }} / {{ fmtBytes(i.resources.mem.total_bytes) }} ({{ i.resources.mem.used_pct.toFixed(1) }}%)</dd>
            </template>
            <template v-if="i.resources.load">
              <dt class="text-slate-500">Load</dt>
              <dd>{{ i.resources.load['1m'].toFixed(2) }} / {{ i.resources.load['5m'].toFixed(2) }} / {{ i.resources.load['15m'].toFixed(2) }}</dd>
            </template>
          </dl>
          <div v-if="!isError(i.resources) && i.resources.disk?.length" class="mt-3 space-y-1">
            <p class="text-xs uppercase tracking-wider text-slate-500">Disk</p>
            <p v-for="d in i.resources.disk" :key="d.mount" class="font-mono text-xs text-slate-400">
              {{ d.mount }} — {{ fmtBytes(d.used_bytes) }} / {{ fmtBytes(d.total_bytes) }} ({{ d.used_pct.toFixed(1) }}%)
            </p>
          </div>
        </section>

        <!-- Temperature -->
        <section class="mt-4">
          <h3 class="text-xs uppercase tracking-wider text-slate-500">Temperature</h3>
          <Alert v-if="isError(i.temperature)" variant="warn" class="mt-2">
            {{ i.temperature._error }}
          </Alert>
          <p v-else class="mt-2 text-sm text-slate-300">
            {{ i.temperature.celsius.toFixed(1) }} °C
            <span class="text-xs text-slate-500"> · {{ i.temperature.sensor }}</span>
          </p>
        </section>
      </li>
    </ul>
  </div>
</template>
