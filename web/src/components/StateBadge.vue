<script setup lang="ts">
import type { SlotState } from '@/api/types';
import { computed } from 'vue';

const props = defineProps<{ state: SlotState }>();

const cfg = computed(() => {
  switch (props.state) {
    case 'running':  return { label: 'running',  cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' };
    case 'starting': return { label: 'starting', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30 mcsw-pulse' };
    case 'mounting': return { label: 'mounting', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30 mcsw-pulse' };
    case 'stopping': return { label: 'stopping', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30 mcsw-pulse' };
    case 'idle':     return { label: 'idle',     cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/30' };
    case 'crashed':  return { label: 'crashed',  cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' };
    case 'error':    return { label: 'error',    cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' };
    default:         return { label: props.state, cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/30' };
  }
});
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1"
    :class="cfg.cls"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ cfg.label }}
  </span>
</template>
