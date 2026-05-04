<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { auditApi, mcsmApi } from '@/api/endpoints';
import type { AuditLocalEntry, AuditMcsmEntry, McsmInstanceDto } from '@/api/types';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';

type Source = 'local' | string; // 'local' or instance id

const instances = ref<McsmInstanceDto[]>([]);
const source = ref<Source>('local');
const localRows = ref<AuditLocalEntry[]>([]);
const mcsmRows = ref<AuditMcsmEntry[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const showingLocal = computed(() => source.value === 'local');

async function loadInstances(): Promise<void> {
  const r = await mcsmApi.list();
  instances.value = r.instances;
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    if (showingLocal.value) {
      const r = await auditApi.local({ limit: 200 });
      localRows.value = r.entries;
    } else {
      const r = await auditApi.mcsm(source.value, { limit: 200 });
      mcsmRows.value = r.entries;
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadInstances();
  await load();
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold tracking-tight text-slate-100">Audit log</h1>
      <select v-model="source" @change="load"
              class="ml-auto rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-700 focus:ring-emerald-400">
        <option value="local">mcsw (local)</option>
        <option v-for="i in instances" :key="i.id" :value="i.id">mcsm: {{ i.name }}</option>
      </select>
      <button @click="load" class="text-sm text-slate-400 hover:text-slate-200">Refresh</button>
    </div>

    <Alert v-if="error" variant="error">{{ error }}</Alert>
    <div v-if="loading" class="flex justify-center py-12"><Spinner /></div>

    <!-- Local mcsw audit -->
    <div v-else-if="showingLocal" class="overflow-hidden rounded-2xl bg-slate-900/60 ring-1 ring-slate-800">
      <table class="min-w-full divide-y divide-slate-800 text-sm">
        <thead class="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-4 py-3 text-left font-medium">When</th>
            <th class="px-4 py-3 text-left font-medium">Actor</th>
            <th class="px-4 py-3 text-left font-medium">Action</th>
            <th class="px-4 py-3 text-left font-medium">Target</th>
            <th class="px-4 py-3 text-left font-medium">Result</th>
            <th class="px-4 py-3 text-left font-medium">IP</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr v-for="e in localRows" :key="e.id" class="hover:bg-slate-900">
            <td class="whitespace-nowrap px-4 py-3 text-slate-400">{{ new Date(e.ts).toLocaleString() }}</td>
            <td class="px-4 py-3 text-slate-300">{{ e.actor?.email ?? '—' }}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-200">{{ e.action }}</td>
            <td class="max-w-md px-4 py-3 font-mono text-xs text-slate-500 truncate">{{ JSON.stringify(e.target) }}</td>
            <td class="px-4 py-3">
              <span :class="e.result === 'ok' ? 'text-emerald-300' : 'text-rose-300'">
                {{ e.result }}<template v-if="e.errorCode"> · {{ e.errorCode }}</template>
              </span>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-500">{{ e.ip ?? '—' }}</td>
          </tr>
          <tr v-if="!localRows.length"><td colspan="6" class="px-4 py-12 text-center text-slate-500">No entries.</td></tr>
        </tbody>
      </table>
    </div>

    <!-- mcsm audit -->
    <div v-else class="overflow-hidden rounded-2xl bg-slate-900/60 ring-1 ring-slate-800">
      <table class="min-w-full divide-y divide-slate-800 text-sm">
        <thead class="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-4 py-3 text-left font-medium">When</th>
            <th class="px-4 py-3 text-left font-medium">Actor</th>
            <th class="px-4 py-3 text-left font-medium">Kind</th>
            <th class="px-4 py-3 text-left font-medium">Subject</th>
            <th class="px-4 py-3 text-left font-medium">Result</th>
            <th class="px-4 py-3 text-left font-medium">Trace</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr v-for="e in mcsmRows" :key="e.id" class="hover:bg-slate-900">
            <td class="whitespace-nowrap px-4 py-3 text-slate-400">{{ new Date(e.at).toLocaleString() }}</td>
            <td class="px-4 py-3 text-slate-300">{{ e.actor.kind }}:{{ e.actor.name }}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-200">{{ e.kind }}</td>
            <td class="max-w-md px-4 py-3 font-mono text-xs text-slate-500 truncate">{{ JSON.stringify(e.subject) }}</td>
            <td class="px-4 py-3">
              <span :class="e.result === 'ok' ? 'text-emerald-300' : 'text-rose-300'">
                {{ e.result }}<template v-if="e.status"> · {{ e.status }}</template>
              </span>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-500">{{ e.trace_id?.slice(0, 8) ?? '—' }}</td>
          </tr>
          <tr v-if="!mcsmRows.length"><td colspan="6" class="px-4 py-12 text-center text-slate-500">No entries.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
