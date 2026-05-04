<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminUsersApi, grantsApi, mcsmApi, discoveryApi } from '@/api/endpoints';
import type { GrantDto, McsmInstanceDto, UserDto } from '@/api/types';
import Spinner from '@/components/Spinner.vue';
import Btn from '@/components/Btn.vue';
import Alert from '@/components/Alert.vue';
import { ArrowLeftIcon } from '@heroicons/vue/24/outline';

const props = defineProps<{ userId: string }>();

const user = ref<UserDto | null>(null);
const grants = ref<GrantDto[]>([]);
const instances = ref<McsmInstanceDto[]>([]);
const servers = ref<Array<{ instance: string; instanceId: string; id: string; name: string }>>([]);
const loading = ref(true);
const message = ref<string | null>(null);

interface Cap { key: 'start' | 'stop' | 'restart' | 'command' | 'moderate' | 'admin' | 'invite'; label: string }
const caps: Cap[] = [
  { key: 'start',    label: 'start' },
  { key: 'stop',     label: 'stop' },
  { key: 'restart',  label: 'restart' },
  { key: 'command',  label: 'command' },
  { key: 'moderate', label: 'moderate' },
  { key: 'admin',    label: 'admin' },
  { key: 'invite',   label: 'invite' },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [users, grantsResp, instResp, discResp] = await Promise.all([
      adminUsersApi.list(),
      grantsApi.listForUser(props.userId),
      mcsmApi.list(),
      discoveryApi.list().catch(() => null),
    ]);
    user.value = users.users.find((u) => u.id === props.userId) ?? null;
    grants.value = grantsResp.grants;
    instances.value = instResp.instances;

    // Federation discovery is a flat servers array. Each server has
    // `ownership.instance` if it's currently mounted somewhere; otherwise
    // it's free and any peer can mount it. For grants we attribute by
    // owning instance when known, else leave it unset (admin picks the
    // peer in the form).
    const idByName = new Map(instResp.instances.map((i) => [i.name, i.id]));
    const flat: Array<{ instance: string; instanceId: string; id: string; name: string }> = [];
    for (const srv of discResp?.servers ?? []) {
      const instanceName = srv.ownership?.instance ?? '';
      const instanceId = idByName.get(instanceName) ?? '';
      flat.push({ instance: instanceName, instanceId, id: srv.id, name: srv.name });
    }
    servers.value = flat;
  } finally {
    loading.value = false;
  }
}

async function togglePerm(grant: GrantDto, key: Cap['key']): Promise<void> {
  const permissions = { ...grant.permissions, [key]: !grant.permissions[key] };
  await grantsApi.upsert({
    userId: grant.userId,
    mcsmInstanceId: grant.instance.id,
    serverId: grant.serverId,
    permissions,
  });
  load();
}

async function delGrant(g: GrantDto): Promise<void> {
  if (!confirm('Remove this grant?')) return;
  await grantsApi.delete(g.id);
  load();
}

const addInstance = ref('');
const addServer = ref('');
async function addGrant(): Promise<void> {
  if (!addInstance.value || !addServer.value) return;
  await grantsApi.upsert({
    userId: props.userId,
    mcsmInstanceId: addInstance.value,
    serverId: addServer.value,
    permissions: { start: true, stop: true, restart: true, command: true },
  });
  message.value = 'Grant added.';
  addInstance.value = addServer.value = '';
  load();
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
    <RouterLink :to="{ name: 'admin.users' }" class="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
      <ArrowLeftIcon class="h-4 w-4" /> Users
    </RouterLink>
    <h1 class="text-2xl font-bold text-slate-100">Grants — {{ user?.email }}</h1>

    <div v-if="loading" class="flex justify-center py-12"><Spinner /></div>

    <template v-else>
      <Alert v-if="message" variant="success" class="mt-4">{{ message }}</Alert>

      <section class="mt-6 rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
        <h2 class="text-lg font-semibold text-slate-100">Add server access</h2>
        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select v-model="addInstance" class="rounded-lg border-0 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-inset ring-slate-700">
            <option value="">— mcsm instance —</option>
            <option v-for="i in instances" :key="i.id" :value="i.id">{{ i.name }}</option>
          </select>
          <select v-model="addServer" class="rounded-lg border-0 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-inset ring-slate-700 sm:col-span-1">
            <option value="">— server —</option>
            <option v-for="s in servers.filter((s) => !addInstance || s.instanceId === addInstance)" :key="s.id" :value="s.id">
              {{ s.instance }} / {{ s.name }}
            </option>
          </select>
          <Btn @click="addGrant" :disabled="!addInstance || !addServer">Add</Btn>
        </div>
      </section>

      <section class="mt-6 rounded-2xl bg-slate-900/60 ring-1 ring-slate-800">
        <header class="border-b border-slate-800 p-5">
          <h2 class="text-lg font-semibold text-slate-100">Current grants</h2>
        </header>
        <ul v-if="grants.length === 0" class="p-6 text-center text-sm text-slate-500">No grants.</ul>
        <ul v-else class="divide-y divide-slate-800">
          <li v-for="g in grants" :key="g.id" class="p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-sm font-medium text-slate-200">{{ g.instance.name }}</p>
                <p class="font-mono text-xs text-slate-500">{{ g.serverId }}</p>
              </div>
              <button @click="delGrant(g)" class="text-xs text-rose-400 hover:text-rose-300">remove</button>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="c in caps" :key="c.key"
                @click="togglePerm(g, c.key)"
                class="rounded-full px-3 py-1 text-xs ring-1 transition-colors"
                :class="g.permissions[c.key]
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-slate-800 text-slate-400 ring-slate-700 hover:bg-slate-700'"
              >
                {{ c.label }}
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
