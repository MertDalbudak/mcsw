<script setup lang="ts">
import { ref } from 'vue';
import { serverApi } from '@/api/endpoints';
import type { ServerUpdateInfo } from '@/api/types';
import { ApiError } from '@/api/client';
import Alert from '@/components/Alert.vue';
import Btn from '@/components/Btn.vue';
import Field from '@/components/Field.vue';
import Spinner from '@/components/Spinner.vue';
import { useToastStore } from '@/stores/toasts';

const props = defineProps<{ instanceId: string; slot: string }>();
const mcVersion = ref('');
const info = ref<ServerUpdateInfo | null>(null);
const checking = ref(false);
const applying = ref(false);
const backup = ref(true);
const error = ref<string | null>(null);
const toast = useToastStore();

async function check(): Promise<void> {
  error.value = null;
  checking.value = true;
  try {
    info.value = await serverApi.checkUpdate(props.instanceId, props.slot, mcVersion.value || undefined);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Check failed';
    info.value = null;
  } finally {
    checking.value = false;
  }
}

async function apply(): Promise<void> {
  if (!info.value) return;
  if (!confirm(`Apply update to ${info.value.flavor} ${info.value.mc_version} build ${info.value.build}? Slot must be stopped.`)) return;
  applying.value = true;
  try {
    await serverApi.applyUpdate(props.instanceId, props.slot, {
      mc_version: info.value.mc_version,
      backup: backup.value,
    });
    toast.push('Update applied', 'success');
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Apply failed', 'error');
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <div class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
    <h2 class="text-lg font-semibold text-slate-100">Server update</h2>
    <p class="mt-1 text-sm text-slate-400">Check the latest Paper build for a Minecraft version, then apply (slot must be stopped).</p>

    <form class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" @submit.prevent="check">
      <div class="sm:col-span-2"><Field v-model="mcVersion" label="MC version" placeholder="1.21.4 (blank = current)" /></div>
      <div class="flex items-end"><Btn type="submit" :loading="checking" block>Check</Btn></div>
    </form>

    <Alert v-if="error" variant="error" class="mt-4">{{ error }}</Alert>

    <div v-if="checking" class="flex justify-center py-6"><Spinner /></div>

    <div v-else-if="info" class="mt-6 space-y-3 rounded-xl bg-slate-950/50 p-4 ring-1 ring-slate-800">
      <p class="text-sm">
        <span class="text-slate-500">Flavor:</span> {{ info.flavor }}
        <span class="text-slate-500"> · MC:</span> {{ info.mc_version }}
        <span class="text-slate-500"> · Build:</span> {{ info.build }}
      </p>
      <p class="text-xs text-slate-500 break-all">{{ info.jar_name }} ({{ info.sha256.slice(0, 12) }}…)</p>
      <p class="text-xs text-slate-500">Published {{ new Date(info.published_at).toLocaleString() }}</p>
      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input v-model="backup" type="checkbox"
               class="rounded bg-slate-900 ring-1 ring-slate-700 text-emerald-500 focus:ring-emerald-400" />
        Take a backup before applying
      </label>
      <Btn :loading="applying" @click="apply">Apply update</Btn>
    </div>
  </div>
</template>
