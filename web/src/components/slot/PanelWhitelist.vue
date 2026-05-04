<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { serverApi } from '@/api/endpoints';
import type { WhitelistResponse } from '@/api/types';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';
import Btn from '@/components/Btn.vue';
import Field from '@/components/Field.vue';
import { useToastStore } from '@/stores/toasts';

const props = defineProps<{ instanceId: string; slot: string }>();
const data = ref<WhitelistResponse | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const adding = ref(false);
const newName = ref('');
const toast = useToastStore();

async function load(): Promise<void> {
  loading.value = true;
  try {
    data.value = await serverApi.whitelist(props.instanceId, props.slot);
    error.value = null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function add(): Promise<void> {
  if (!newName.value.trim()) return;
  adding.value = true;
  try {
    await serverApi.addWhitelist(props.instanceId, props.slot, newName.value.trim());
    toast.push(`Whitelisted ${newName.value.trim()}`, 'success');
    newName.value = '';
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Add failed', 'error');
  } finally {
    adding.value = false;
  }
}

async function remove(name: string): Promise<void> {
  if (!confirm(`Remove ${name} from whitelist?`)) return;
  try {
    await serverApi.removeWhitelist(props.instanceId, props.slot, name);
    toast.push(`Removed ${name}`, 'success');
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Remove failed', 'error');
  }
}

async function reload(): Promise<void> {
  try {
    await serverApi.reloadWhitelist(props.instanceId, props.slot);
    toast.push('Whitelist reloaded', 'success');
    await load();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Reload failed', 'error');
  }
}

onMounted(load);
</script>

<template>
  <div class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-100">Whitelist</h2>
      <span v-if="data" class="text-xs"
            :class="data.enabled ? 'text-emerald-300' : 'text-slate-500'">
        {{ data.enabled ? 'enabled' : 'disabled' }}
      </span>
    </div>
    <Alert v-if="error" variant="error" class="mt-4">{{ error }}</Alert>
    <form class="mt-4 flex items-end gap-3" @submit.prevent="add">
      <div class="flex-1"><Field v-model="newName" label="Add player" placeholder="Mojang username" /></div>
      <Btn type="submit" :loading="adding" :disabled="!newName.trim()">Add</Btn>
      <Btn variant="secondary" @click="reload">Reload</Btn>
    </form>
    <div v-if="loading" class="flex justify-center py-8"><Spinner /></div>
    <ul v-else-if="data?.players?.length" class="mt-4 divide-y divide-slate-800">
      <li v-for="p in data.players" :key="p.uuid ?? p.name" class="flex items-center gap-3 py-3">
        <img v-if="p.uuid" :src="`https://crafatar.com/avatars/${p.uuid}?size=32&overlay`" :alt="p.name"
             class="h-8 w-8 rounded-md ring-1 ring-slate-700" />
        <div v-else class="h-8 w-8 rounded-md bg-slate-800" />
        <div class="flex-1 min-w-0">
          <p class="truncate text-sm text-slate-200">{{ p.name }}</p>
          <p v-if="p.uuid" class="text-xs text-slate-500 truncate">{{ p.uuid }}</p>
        </div>
        <button @click="remove(p.name)" class="text-xs text-rose-400 hover:text-rose-300">remove</button>
      </li>
    </ul>
    <p v-else class="mt-4 italic text-slate-500">Whitelist is empty.</p>
  </div>
</template>
