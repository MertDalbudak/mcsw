<script setup lang="ts">
interface Props { variant?: 'info' | 'warn' | 'error' | 'success'; }
withDefaults(defineProps<Props>(), { variant: 'info' });
</script>

<template>
  <div
    role="alert"
    class="rounded-lg px-4 py-3 text-sm ring-1"
    :class="{
      'bg-sky-500/10 ring-sky-500/30 text-sky-200': variant === 'info',
      'bg-amber-500/10 ring-amber-500/30 text-amber-200': variant === 'warn',
      'bg-rose-500/10 ring-rose-500/30 text-rose-200': variant === 'error',
      'bg-emerald-500/10 ring-emerald-500/30 text-emerald-200': variant === 'success',
    }"
  >
    <slot />
  </div>
</template>
