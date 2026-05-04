<script setup lang="ts">
import { useToastStore } from '@/stores/toasts';
import { XMarkIcon } from '@heroicons/vue/24/outline';

const store = useToastStore();
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:top-4">
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
      tag="div"
      class="flex w-full max-w-md flex-col gap-2"
    >
      <div
        v-for="t in store.items" :key="t.id"
        role="alert"
        class="pointer-events-auto flex items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ring-1 backdrop-blur"
        :class="{
          'bg-sky-500/15 ring-sky-500/40 text-sky-100': t.kind === 'info',
          'bg-amber-500/15 ring-amber-500/40 text-amber-100': t.kind === 'warn',
          'bg-rose-500/15 ring-rose-500/40 text-rose-100': t.kind === 'error',
          'bg-emerald-500/15 ring-emerald-500/40 text-emerald-100': t.kind === 'success',
        }"
      >
        <span class="flex-1 break-words">{{ t.message }}</span>
        <button @click="store.dismiss(t.id)" class="shrink-0 rounded p-0.5 hover:bg-white/10" aria-label="Dismiss">
          <XMarkIcon class="h-4 w-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
