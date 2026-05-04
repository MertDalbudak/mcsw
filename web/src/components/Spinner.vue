<script setup lang="ts">
interface Props { size?: 'sm' | 'md' | 'lg'; }
withDefaults(defineProps<Props>(), { size: 'md' });
</script>

<template>
  <div
    role="status"
    aria-label="Loading"
    class="inline-block animate-spin rounded-full border-2 border-current border-r-transparent"
    :class="{
      'h-4 w-4': size === 'sm',
      'h-6 w-6': size === 'md',
      'h-10 w-10': size === 'lg',
    }"
  />
</template>
