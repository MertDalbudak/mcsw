<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { serverApi } from '@/api/endpoints';
import type { PropertiesResponse, PropertiesPatchResponse } from '@/api/types';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';
import Btn from '@/components/Btn.vue';
import { useToastStore } from '@/stores/toasts';

const props = defineProps<{ instanceId: string; slot: string }>();
const data = ref<PropertiesResponse | null>(null);
const draft = ref<Record<string, string | number | boolean>>({});
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const lastResult = ref<PropertiesPatchResponse | null>(null);
const toast = useToastStore();

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await serverApi.properties(props.instanceId, props.slot);
    data.value = r;
    draft.value = { ...r.values };
    error.value = null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load';
  } finally {
    loading.value = false;
  }
}

function changedKeys(): string[] {
  if (!data.value) return [];
  return Object.keys(draft.value).filter((k) => draft.value[k] !== data.value!.values[k]);
}

async function save(): Promise<void> {
  if (!data.value) return;
  const keys = changedKeys();
  if (keys.length === 0) {
    toast.push('No changes to save', 'info');
    return;
  }
  const values: Record<string, string | number | boolean> = {};
  for (const k of keys) values[k] = draft.value[k]!;
  saving.value = true;
  try {
    lastResult.value = await serverApi.patchProperties(props.instanceId, props.slot, values);
    toast.push(`Applied: ${lastResult.value.applied.join(', ') || 'nothing'}`, 'success');
    if (lastResult.value.rejected.length) {
      toast.push(`Rejected: ${lastResult.value.rejected.join(', ')}`, 'warn');
    }
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Save failed', 'error');
  } finally {
    saving.value = false;
  }
}

function typeOf(v: unknown): 'boolean' | 'number' | 'string' {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  return 'string';
}

onMounted(load);
</script>

<template>
  <div class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-100">server.properties</h2>
      <span v-if="data" class="text-xs text-slate-500 truncate ml-4 max-w-md">{{ data.raw_path }}</span>
    </div>
    <Alert v-if="error" variant="error" class="mt-4">{{ error }}</Alert>
    <div v-if="loading" class="flex justify-center py-12"><Spinner /></div>
    <template v-else-if="data">
      <Alert v-if="lastResult?.requires_restart?.length" variant="warn" class="mt-4">
        Restart required for: <code>{{ lastResult.requires_restart.join(', ') }}</code>
      </Alert>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div v-for="(value, key) in draft" :key="key" class="flex flex-col gap-1">
          <label class="text-xs uppercase tracking-wider text-slate-500">{{ key }}</label>
          <input v-if="typeOf(value) === 'boolean'" type="checkbox"
                 :checked="!!value"
                 @change="draft[key] = ($event.target as HTMLInputElement).checked"
                 class="h-5 w-5 rounded bg-slate-900 ring-1 ring-slate-700 text-emerald-500 focus:ring-emerald-400" />
          <input v-else-if="typeOf(value) === 'number'" type="number"
                 :value="value"
                 @input="draft[key] = Number(($event.target as HTMLInputElement).value)"
                 class="rounded-lg border-0 bg-slate-900 px-3 py-2 text-sm text-slate-100 ring-1 ring-inset ring-slate-700 focus:ring-2 focus:ring-emerald-400" />
          <input v-else type="text"
                 :value="value"
                 @input="draft[key] = ($event.target as HTMLInputElement).value"
                 class="rounded-lg border-0 bg-slate-900 px-3 py-2 text-sm text-slate-100 ring-1 ring-inset ring-slate-700 focus:ring-2 focus:ring-emerald-400" />
        </div>
      </div>
      <div class="mt-5 flex items-center gap-3">
        <Btn :loading="saving" @click="save">Save changes</Btn>
        <span v-if="changedKeys().length" class="text-xs text-amber-300">{{ changedKeys().length }} unsaved change(s)</span>
      </div>
    </template>
  </div>
</template>
