<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { serverApi } from '@/api/endpoints';
import type { BackupDto } from '@/api/types';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';
import Btn from '@/components/Btn.vue';
import Field from '@/components/Field.vue';
import { useToastStore } from '@/stores/toasts';

const props = defineProps<{ instanceId: string; slot: string }>();
const list = ref<BackupDto[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const creating = ref(false);
const label = ref('');
const stopServer = ref(false);
const includeLogs = ref(false);
const toast = useToastStore();

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await serverApi.backups(props.instanceId, props.slot);
    list.value = r.backups;
    error.value = null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function create(): Promise<void> {
  creating.value = true;
  try {
    await serverApi.createBackup(props.instanceId, props.slot, {
      label: label.value || undefined,
      stop_server: stopServer.value,
      include_logs: includeLogs.value,
    });
    toast.push('Backup created', 'success');
    label.value = '';
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Create failed', 'error');
  } finally {
    creating.value = false;
  }
}

async function restore(b: BackupDto): Promise<void> {
  if (!confirm(`Restore "${b.label ?? b.id}"? Slot must be stopped.`)) return;
  try {
    await serverApi.restoreBackup(props.instanceId, props.slot, b.id);
    toast.push('Restore started', 'success');
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Restore failed', 'error');
  }
}

async function del(b: BackupDto): Promise<void> {
  if (!confirm(`Delete "${b.label ?? b.id}"?`)) return;
  try {
    await serverApi.deleteBackup(props.instanceId, props.slot, b.id);
    toast.push('Backup deleted', 'success');
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Delete failed', 'error');
  }
}

function fmtSize(n?: number): string {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <Alert v-if="error" variant="error">{{ error }}</Alert>

    <section class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
      <h2 class="text-lg font-semibold text-slate-100">New backup</h2>
      <form class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="create">
        <Field v-model="label" label="Label (optional)" placeholder="before-update" />
        <div class="flex flex-col gap-2 text-sm text-slate-300">
          <label class="flex items-center gap-2">
            <input v-model="stopServer" type="checkbox"
                   class="rounded bg-slate-900 ring-1 ring-slate-700 text-emerald-500 focus:ring-emerald-400" />
            Stop server first (offline backup)
          </label>
          <label class="flex items-center gap-2">
            <input v-model="includeLogs" type="checkbox"
                   class="rounded bg-slate-900 ring-1 ring-slate-700 text-emerald-500 focus:ring-emerald-400" />
            Include log files
          </label>
        </div>
        <div class="sm:col-span-2"><Btn type="submit" :loading="creating">Create backup</Btn></div>
      </form>
    </section>

    <section class="rounded-2xl bg-slate-900/60 ring-1 ring-slate-800">
      <header class="flex items-center justify-between border-b border-slate-800 p-5">
        <h2 class="text-lg font-semibold text-slate-100">Backups</h2>
        <button @click="load" class="text-sm text-slate-400 hover:text-slate-200">Refresh</button>
      </header>
      <div v-if="loading" class="flex justify-center py-8"><Spinner /></div>
      <ul v-else-if="list.length === 0" class="p-6 text-center text-sm text-slate-500">No backups yet.</ul>
      <ul v-else class="divide-y divide-slate-800">
        <li v-for="b in list" :key="b.id" class="flex items-start justify-between gap-4 p-5">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-100">{{ b.label || b.id }}</p>
            <p class="text-xs text-slate-500">
              {{ new Date(b.created_at).toLocaleString() }}
              <template v-if="b.size_bytes"> · {{ fmtSize(b.size_bytes) }}</template>
              <template v-if="b.include_logs"> · with logs</template>
            </p>
          </div>
          <div class="flex shrink-0 gap-2 text-xs">
            <button @click="restore(b)" class="text-emerald-400 hover:text-emerald-300">restore</button>
            <button @click="del(b)"     class="text-rose-400 hover:text-rose-300">delete</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
