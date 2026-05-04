<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <span class="text-2xl">⛏</span>
        </div>
        <h1 class="mt-3 text-2xl font-bold tracking-tight text-slate-100">mcsw</h1>
        <p class="text-sm text-slate-400">Minecraft server manager</p>
      </div>
      <div class="rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800 shadow-xl">
        <RouterView />
      </div>
    </div>
  </div>
</template>
