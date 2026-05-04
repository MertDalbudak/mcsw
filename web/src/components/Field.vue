<script setup lang="ts">
import { useId } from 'vue';

interface Props {
  modelValue: string;
  label: string;
  type?: string;
  placeholder?: string;
  autocomplete?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
}
const props = withDefaults(defineProps<Props>(), { type: 'text' });
defineEmits<{ 'update:modelValue': [value: string] }>();
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium text-slate-300">
      {{ label }}
      <span v-if="required" class="text-rose-400" aria-hidden="true">*</span>
    </label>
    <input
      :id="id"
      :type="type"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      :disabled="disabled"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      class="block w-full rounded-lg border-0 bg-slate-900 px-3.5 py-2.5 text-slate-100 ring-1 ring-inset ring-slate-700 placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-emerald-400 disabled:opacity-50"
      :class="error ? 'ring-rose-500' : ''"
    />
    <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-slate-500">{{ hint }}</p>
  </div>
</template>
