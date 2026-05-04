<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { PauseIcon, PlayIcon, ArrowDownIcon, TrashIcon } from '@heroicons/vue/24/outline';

interface LogFrame {
  ts?: string;
  thread?: string;
  level?: string;
  message?: string;
  raw?: string;
}

const props = defineProps<{ instanceId: string; slot: string }>();

const lines = ref<LogFrame[]>([]);
const paused = ref(false);
const autoscroll = ref(true);
const filter = ref<'' | 'INFO' | 'WARN' | 'ERROR'>('');
const connected = ref(false);
const scrollEl = ref<HTMLElement | null>(null);

let ws: WebSocket | null = null;

function open(): void {
  close();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/api/proxy/mcsm/${encodeURIComponent(props.instanceId)}/slots/${encodeURIComponent(props.slot)}/logs?tail=200`;
  ws = new WebSocket(url);
  ws.onopen = () => { connected.value = true; };
  ws.onclose = () => { connected.value = false; ws = null; };
  ws.onmessage = (ev) => {
    if (paused.value) return;
    try {
      const frame = JSON.parse(ev.data) as LogFrame;
      lines.value.push(frame);
      if (lines.value.length > 2000) lines.value.splice(0, lines.value.length - 2000);
      if (autoscroll.value) nextTick(scrollToBottom);
    } catch {
      lines.value.push({ message: String(ev.data) });
    }
  };
}

function close(): void {
  ws?.close();
  ws = null;
  connected.value = false;
}

function clear(): void { lines.value = []; }

function scrollToBottom(): void {
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

function levelClass(level?: string): string {
  switch (level?.toUpperCase()) {
    case 'ERROR': return 'text-rose-400';
    case 'WARN':  return 'text-amber-300';
    case 'INFO':  return 'text-slate-300';
    default:      return 'text-slate-500';
  }
}

function shouldShow(line: LogFrame): boolean {
  if (!filter.value) return true;
  return line.level?.toUpperCase() === filter.value;
}

onMounted(open);
onUnmounted(close);
watch(() => [props.instanceId, props.slot], () => { lines.value = []; open(); });
</script>

<template>
  <div class="flex h-full flex-col rounded-2xl bg-slate-950/80 ring-1 ring-slate-800">
    <header class="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2 text-xs">
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ring-1"
        :class="connected ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' : 'bg-slate-700/40 text-slate-400 ring-slate-700'"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-current" />
        {{ connected ? 'live' : 'disconnected' }}
      </span>
      <span class="text-slate-500">{{ lines.length }} lines</span>

      <select v-model="filter" class="ml-auto rounded bg-slate-900 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-400">
        <option value="">all levels</option>
        <option value="INFO">info</option>
        <option value="WARN">warn</option>
        <option value="ERROR">error</option>
      </select>
      <label class="flex items-center gap-1 text-slate-400">
        <input v-model="autoscroll" type="checkbox" class="rounded bg-slate-900 ring-1 ring-slate-700 text-emerald-500 focus:ring-emerald-400" />
        autoscroll
      </label>
      <button @click="paused = !paused" class="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800" :title="paused ? 'Resume' : 'Pause'">
        <component :is="paused ? PlayIcon : PauseIcon" class="h-4 w-4" />
        {{ paused ? 'paused' : 'pause' }}
      </button>
      <button @click="scrollToBottom" class="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800" title="Scroll to bottom">
        <ArrowDownIcon class="h-4 w-4" />
      </button>
      <button @click="clear" class="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-800" title="Clear">
        <TrashIcon class="h-4 w-4" />
      </button>
    </header>
    <div ref="scrollEl" class="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed">
      <p v-if="lines.length === 0" class="italic text-slate-500">Waiting for log lines…</p>
      <template v-for="(line, i) in lines" :key="i">
        <p v-if="shouldShow(line)" class="whitespace-pre-wrap break-words" :class="levelClass(line.level)">
          <span v-if="line.ts" class="text-slate-600">{{ new Date(line.ts).toLocaleTimeString() }} </span>
          <span v-if="line.level" class="font-bold">[{{ line.level }}] </span>
          <span>{{ line.message ?? line.raw }}</span>
        </p>
      </template>
    </div>
  </div>
</template>
