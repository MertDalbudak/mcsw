import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastKind = 'info' | 'warn' | 'error' | 'success';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after this many ms; null = sticky. */
  ttl: number | null;
}

let nextId = 1;

export const useToastStore = defineStore('toasts', () => {
  const items = ref<Toast[]>([]);

  function push(message: string, kind: ToastKind = 'info', ttl: number | null = 4000): number {
    const id = nextId++;
    items.value.push({ id, kind, message, ttl });
    if (ttl !== null) {
      setTimeout(() => dismiss(id), ttl);
    }
    return id;
  }

  function dismiss(id: number): void {
    items.value = items.value.filter((t) => t.id !== id);
  }

  return { items, push, dismiss };
});
