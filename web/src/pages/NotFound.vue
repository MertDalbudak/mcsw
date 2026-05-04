<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="flex h-full items-center justify-center bg-slate-950 px-4 py-12">
    <div class="text-center">
      <p class="text-sm font-semibold uppercase tracking-wider text-emerald-400">404</p>
      <h1 class="mt-2 text-3xl font-bold text-slate-100">Not found</h1>
      <p class="mt-2 text-slate-400">That page doesn't exist.</p>
      <RouterLink :to="{ name: 'dashboard' }" class="mt-6 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400">
        Back to dashboard
      </RouterLink>
    </div>
  </div>
</template>
