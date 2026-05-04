<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { mcsmApi } from '@/api/endpoints';
import type { McsmInstanceDto } from '@/api/types';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import Alert from '@/components/Alert.vue';

const list = ref<McsmInstanceDto[]>([]);
const loading = ref(true);

const newName = ref('');
const newUrl = ref('http://');
const newToken = ref('');
const newPrimary = ref(false);
const newNotes = ref('');
const creating = ref(false);
const formMsg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null);

const probeHost = ref('');
const probePort = ref('8124');
const probing = ref(false);
const probeResult = ref<{ reachable: boolean; authRequired: boolean; instanceName?: string; version?: string } | null>(null);

const scanning = ref(false);
const scanResult = ref<{ added: number } | null>(null);

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const r = await mcsmApi.list();
    list.value = r.instances;
  } finally {
    loading.value = false;
  }
}

async function create(): Promise<void> {
  formMsg.value = null;
  creating.value = true;
  try {
    await mcsmApi.create({
      name: newName.value,
      baseUrl: newUrl.value,
      authToken: newToken.value,
      isPrimary: newPrimary.value,
      enabled: true,
      notes: newNotes.value || undefined,
    });
    newName.value = newToken.value = newNotes.value = '';
    newUrl.value = 'http://';
    newPrimary.value = false;
    formMsg.value = { kind: 'ok', text: 'Instance added.' };
    refresh();
  } catch (err) {
    formMsg.value = { kind: 'err', text: err instanceof ApiError ? err.message : 'Failed' };
  } finally {
    creating.value = false;
  }
}

async function probe(): Promise<void> {
  probing.value = true;
  probeResult.value = null;
  try {
    const r = await mcsmApi.probe(probeHost.value, Number.parseInt(probePort.value, 10));
    probeResult.value = r.result;
  } finally {
    probing.value = false;
  }
}

async function scan(): Promise<void> {
  scanning.value = true;
  scanResult.value = null;
  try {
    const r = await mcsmApi.scan();
    scanResult.value = { added: r.added };
    refresh();
  } finally {
    scanning.value = false;
  }
}

async function setEnabled(i: McsmInstanceDto, enabled: boolean): Promise<void> {
  await mcsmApi.update(i.id, { enabled }).catch((e) => alert(e.message));
  refresh();
}
async function setPrimary(i: McsmInstanceDto): Promise<void> {
  await mcsmApi.update(i.id, { isPrimary: true }).catch((e) => alert(e.message));
  refresh();
}
async function setToken(i: McsmInstanceDto): Promise<void> {
  const token = prompt(`Enter bearer token for ${i.name}:`);
  if (!token) return;
  await mcsmApi.update(i.id, { authToken: token }).catch((e) => alert(e.message));
  refresh();
}
async function del(i: McsmInstanceDto): Promise<void> {
  if (!confirm(`Delete ${i.name}? Server grants tied to it will be removed.`)) return;
  await mcsmApi.delete(i.id).catch((e) => alert(e.message));
  refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
    <h1 class="mb-6 text-2xl font-bold tracking-tight text-slate-100">mcsm Instances</h1>

    <!-- Add new -->
    <section class="rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
      <h2 class="text-lg font-semibold text-slate-100">Add instance</h2>
      <p class="mt-1 text-sm text-slate-400">Manual config for any reachable mcsm peer (LAN or external).</p>
      <form class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="create">
        <Field v-model="newName" label="Name" required hint="lowercase, dashes — e.g. node-a" />
        <Field v-model="newUrl" label="Base URL" type="url" required placeholder="https://mcsm.example.com:8124" />
        <div class="sm:col-span-2"><Field v-model="newToken" label="Bearer token" type="password" required /></div>
        <Field v-model="newNotes" label="Notes (optional)" />
        <label class="flex items-center gap-2 text-sm text-slate-300">
          <input v-model="newPrimary" type="checkbox" class="rounded bg-slate-900 ring-1 ring-slate-700 text-emerald-500 focus:ring-emerald-400" />
          Primary federation entry
        </label>
        <Alert v-if="formMsg" :variant="formMsg.kind === 'ok' ? 'success' : 'error'" class="sm:col-span-2">{{ formMsg.text }}</Alert>
        <div class="sm:col-span-2"><Btn type="submit" :loading="creating">Add instance</Btn></div>
      </form>
    </section>

    <!-- Scan + probe -->
    <section class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
        <h2 class="text-lg font-semibold text-slate-100">LAN scan</h2>
        <p class="mt-1 text-sm text-slate-400">Auto-discovered peers land disabled until you supply a token.</p>
        <div class="mt-4"><Btn variant="secondary" :loading="scanning" @click="scan">Scan now</Btn></div>
        <Alert v-if="scanResult" variant="success" class="mt-4">Added {{ scanResult.added }} new peer(s).</Alert>
      </div>
      <div class="rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
        <h2 class="text-lg font-semibold text-slate-100">Probe address</h2>
        <p class="mt-1 text-sm text-slate-400">Test a host:port (LAN or external).</p>
        <form class="mt-4 grid grid-cols-3 gap-3" @submit.prevent="probe">
          <div class="col-span-2"><Field v-model="probeHost" label="Host" placeholder="example.com" required /></div>
          <Field v-model="probePort" label="Port" type="number" required />
          <div class="col-span-3"><Btn type="submit" :loading="probing">Probe</Btn></div>
        </form>
        <Alert v-if="probeResult" :variant="probeResult.reachable ? 'success' : 'warn'" class="mt-4">
          <template v-if="!probeResult.reachable">Unreachable.</template>
          <template v-else-if="probeResult.authRequired">mcsm reachable; auth required.</template>
          <template v-else>mcsm reachable: {{ probeResult.instanceName }} ({{ probeResult.version }}).</template>
        </Alert>
      </div>
    </section>

    <!-- List -->
    <section class="mt-6 rounded-2xl bg-slate-900/60 ring-1 ring-slate-800">
      <header class="flex items-center justify-between border-b border-slate-800 p-5">
        <h2 class="text-lg font-semibold text-slate-100">Configured instances</h2>
        <button @click="refresh" class="text-sm text-slate-400 hover:text-slate-200">Refresh</button>
      </header>
      <div v-if="loading" class="flex justify-center py-12"><Spinner /></div>
      <div v-else-if="list.length === 0" class="p-6 text-center text-sm text-slate-500">No instances yet.</div>
      <ul v-else class="divide-y divide-slate-800">
        <li v-for="i in list" :key="i.id" class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-sm font-medium text-slate-100">
              {{ i.name }}
              <span v-if="i.isPrimary" class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300 ring-1 ring-emerald-500/30">primary</span>
              <span v-if="!i.enabled" class="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-300 ring-1 ring-amber-500/30">disabled</span>
              <span v-if="i.source === 'discovered'" class="rounded bg-sky-500/10 px-1.5 py-0.5 text-xs text-sky-300 ring-1 ring-sky-500/30">discovered</span>
              <span v-if="!i.hasToken" class="rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-300 ring-1 ring-rose-500/30">no token</span>
            </p>
            <p class="mt-1 truncate text-xs text-slate-500">{{ i.baseUrl }}</p>
            <p v-if="i.lastSeenAt" class="mt-1 text-xs text-slate-500">Last seen {{ new Date(i.lastSeenAt).toLocaleString() }}</p>
            <p v-if="i.lastError" class="mt-1 text-xs text-rose-400 truncate">{{ i.lastError }}</p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button v-if="!i.isPrimary" @click="setPrimary(i)" class="text-xs text-emerald-400 hover:text-emerald-300">set primary</button>
            <button v-if="!i.hasToken" @click="setToken(i)" class="text-xs text-emerald-400 hover:text-emerald-300">add token</button>
            <button v-else @click="setToken(i)" class="text-xs text-slate-400 hover:text-slate-200">rotate token</button>
            <button @click="setEnabled(i, !i.enabled)" class="text-xs text-amber-400 hover:text-amber-300">
              {{ i.enabled ? 'disable' : 'enable' }}
            </button>
            <button @click="del(i)" class="text-xs text-rose-400 hover:text-rose-300">delete</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
