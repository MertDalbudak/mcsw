<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { slotsApi, serverApi } from '@/api/endpoints';
import type { SlotDto } from '@/api/types';
import { ApiError } from '@/api/client';
import StateBadge from '@/components/StateBadge.vue';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';
import Btn from '@/components/Btn.vue';
import LogStream from '@/components/LogStream.vue';
import PanelPlayers from '@/components/slot/PanelPlayers.vue';
import PanelProperties from '@/components/slot/PanelProperties.vue';
import PanelWhitelist from '@/components/slot/PanelWhitelist.vue';
import PanelBanlist from '@/components/slot/PanelBanlist.vue';
import PanelBackups from '@/components/slot/PanelBackups.vue';
import PanelUpdate from '@/components/slot/PanelUpdate.vue';
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from '@headlessui/vue';
import { ArrowLeftIcon, UsersIcon } from '@heroicons/vue/24/outline';
import { useToastStore } from '@/stores/toasts';

const props = defineProps<{ instanceId: string; slot: string }>();
const slot = ref<SlotDto | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const sayMsg = ref('');
const cmdMsg = ref('');
const cmdLast = ref<string | null>(null);
const events = ref<string[]>([]);
const toast = useToastStore();

let ws: WebSocket | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const isRunning = computed(() => slot.value?.state === 'running');

async function refresh(): Promise<void> {
  try {
    const r = await slotsApi.get(props.instanceId, props.slot);
    slot.value = r.slot;
    error.value = null;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load slot';
  } finally {
    loading.value = false;
  }
}

function openWs(): void {
  closeWs();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/api/proxy/mcsm/${encodeURIComponent(props.instanceId)}/slots/${encodeURIComponent(props.slot)}/events`;
  ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    try {
      const frame = JSON.parse(ev.data) as { type: string; [k: string]: unknown };
      events.value.unshift(`${new Date().toLocaleTimeString()}  ${ev.data}`);
      events.value = events.value.slice(0, 80);
      if (frame.type === 'state') refresh();
    } catch {
      events.value.unshift(String(ev.data));
    }
  };
  ws.onclose = () => { ws = null; };
}
function closeWs(): void { ws?.close(); ws = null; }

async function start(): Promise<void> {
  if (!slot.value?.mounted_server?.id) return;
  await call('Start', () => slotsApi.start(props.instanceId, props.slot, slot.value!.mounted_server!.id));
}
async function stop(): Promise<void>    { await call('Stop',    () => slotsApi.stop(props.instanceId, props.slot)); }
async function restart(): Promise<void> { await call('Restart', () => slotsApi.restart(props.instanceId, props.slot)); }

async function call(label: string, fn: () => Promise<unknown>): Promise<void> {
  try { await fn(); toast.push(`${label} sent`, 'success'); refresh(); }
  catch (err) { toast.push(err instanceof ApiError ? err.message : `${label} failed`, 'error'); }
}

async function say(): Promise<void> {
  if (!sayMsg.value.trim()) return;
  try {
    await serverApi.say(props.instanceId, props.slot, sayMsg.value);
    sayMsg.value = '';
    toast.push('Broadcast sent', 'success');
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Send failed', 'error');
  }
}

async function runCmd(): Promise<void> {
  if (!cmdMsg.value.trim()) return;
  try {
    const r = await serverApi.command(props.instanceId, props.slot, cmdMsg.value);
    cmdLast.value = r.response;
    cmdMsg.value = '';
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Command failed', 'error');
  }
}

onMounted(() => {
  refresh();
  openWs();
  pollTimer = setInterval(refresh, 10_000);
});
onUnmounted(() => {
  closeWs();
  if (pollTimer) clearInterval(pollTimer);
});
watch(() => [props.instanceId, props.slot], () => {
  loading.value = true;
  refresh();
  openWs();
});

// Tabs
const tabs = ['Overview', 'Players', 'Logs', 'Properties', 'Whitelist', 'Banlist', 'Backups', 'Update'];
const tabIndex = ref(0);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <RouterLink :to="{ name: 'dashboard' }" class="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
      <ArrowLeftIcon class="h-4 w-4" /> Back
    </RouterLink>

    <div v-if="loading && !slot" class="flex justify-center py-16"><Spinner size="lg" /></div>
    <Alert v-else-if="error" variant="error">{{ error }}</Alert>

    <template v-if="slot">
      <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs uppercase tracking-wider text-slate-500">{{ instanceId }} · slot</p>
          <h1 class="text-2xl font-bold text-slate-100">{{ slot.name }}</h1>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="slot.mounted_server?.slp?.players" class="inline-flex items-center gap-1 text-sm text-slate-400">
            <UsersIcon class="h-4 w-4" />
            {{ slot.mounted_server.slp.players.online }} / {{ slot.mounted_server.slp.players.max }}
          </span>
          <StateBadge :state="slot.state" />
        </div>
      </header>

      <div class="mt-4 flex flex-wrap gap-2">
        <Btn variant="primary"   :disabled="!(slot.state === 'idle' || slot.state === 'crashed' || slot.state === 'error')" @click="start">Start</Btn>
        <Btn variant="secondary" :disabled="!isRunning" @click="restart">Restart</Btn>
        <Btn variant="danger"    :disabled="!(slot.state === 'running' || slot.state === 'starting')" @click="stop">Stop</Btn>
      </div>

      <TabGroup as="div" class="mt-6" :selected-index="tabIndex" @change="tabIndex = $event">
        <TabList class="-mb-px flex gap-1 overflow-x-auto border-b border-slate-800">
          <Tab
            v-for="(name, i) in tabs" :key="name"
            v-slot="{ selected }"
            as="template"
          >
            <button
              :class="[
                'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200',
              ]"
            >{{ name }}</button>
          </Tab>
        </TabList>
        <TabPanels class="mt-5">
          <!-- Overview -->
          <TabPanel>
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800 lg:col-span-2">
                <h2 class="text-sm font-semibold text-slate-300">Mounted server</h2>
                <div v-if="slot.mounted_server" class="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  <div><span class="text-slate-500">Name:</span> {{ slot.mounted_server.name }}</div>
                  <div><span class="text-slate-500">Type:</span> {{ slot.mounted_server.type }} {{ slot.mounted_server.version }}</div>
                  <div v-if="slot.mounted_server.pid"><span class="text-slate-500">PID:</span> {{ slot.mounted_server.pid }}</div>
                  <div v-if="slot.mounted_server.slp?.tps_1m"><span class="text-slate-500">TPS:</span> {{ slot.mounted_server.slp.tps_1m.toFixed(2) }}</div>
                  <div v-if="slot.mounted_server.slp?.motd" class="sm:col-span-2"><span class="text-slate-500">MOTD:</span> {{ slot.mounted_server.slp.motd }}</div>
                </div>
                <p v-else class="mt-3 italic text-slate-500">No server mounted in this slot.</p>

                <div v-if="isRunning" class="mt-6 grid grid-cols-1 gap-3">
                  <form class="flex gap-2" @submit.prevent="say">
                    <input v-model="sayMsg" type="text" placeholder="Broadcast (/say)…"
                      class="flex-1 rounded-lg border-0 bg-slate-900 px-3 py-2 text-sm text-slate-100 ring-1 ring-inset ring-slate-700 focus:ring-2 focus:ring-emerald-400" />
                    <Btn type="submit">Say</Btn>
                  </form>
                  <form class="flex gap-2" @submit.prevent="runCmd">
                    <input v-model="cmdMsg" type="text" placeholder="Raw RCON command (e.g. weather clear)"
                      class="flex-1 rounded-lg border-0 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 ring-1 ring-inset ring-slate-700 focus:ring-2 focus:ring-emerald-400" />
                    <Btn type="submit" variant="secondary">Run</Btn>
                  </form>
                  <pre v-if="cmdLast" class="rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-300 ring-1 ring-slate-800">{{ cmdLast }}</pre>
                </div>
              </section>

              <section class="rounded-2xl bg-slate-900/60 p-5 ring-1 ring-slate-800">
                <h2 class="text-sm font-semibold text-slate-300">Live events</h2>
                <div class="mt-3 h-[300px] overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                  <p v-if="events.length === 0" class="italic">Waiting for events…</p>
                  <p v-for="(e, i) in events" :key="i" class="break-words">{{ e }}</p>
                </div>
              </section>
            </div>
          </TabPanel>
          <TabPanel><PanelPlayers :instance-id="instanceId" :slot="slot.name" /></TabPanel>
          <TabPanel>
            <div class="h-[600px]">
              <LogStream :instance-id="instanceId" :slot="slot.name" />
            </div>
          </TabPanel>
          <TabPanel><PanelProperties :instance-id="instanceId" :slot="slot.name" /></TabPanel>
          <TabPanel><PanelWhitelist :instance-id="instanceId" :slot="slot.name" /></TabPanel>
          <TabPanel><PanelBanlist :instance-id="instanceId" :slot="slot.name" /></TabPanel>
          <TabPanel><PanelBackups :instance-id="instanceId" :slot="slot.name" /></TabPanel>
          <TabPanel><PanelUpdate :instance-id="instanceId" :slot="slot.name" /></TabPanel>
        </TabPanels>
      </TabGroup>
    </template>
  </div>
</template>
