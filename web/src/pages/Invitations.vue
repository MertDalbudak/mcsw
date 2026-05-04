<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { invitationsApi } from '@/api/endpoints';
import type { InvitationDto } from '@/api/types';
import { useAuthStore } from '@/stores/auth';
import { ApiError } from '@/api/client';
import Btn from '@/components/Btn.vue';
import Alert from '@/components/Alert.vue';
import Spinner from '@/components/Spinner.vue';
import Field from '@/components/Field.vue';

const auth = useAuthStore();
const list = ref<InvitationDto[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const expiresInDays = ref<string>('14');
const note = ref('');
const creating = ref(false);
const lastCreated = ref<InvitationDto | null>(null);

async function refresh(): Promise<void> {
  try {
    const r = await invitationsApi.list();
    list.value = r.invitations;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function create(): Promise<void> {
  creating.value = true;
  try {
    const days = expiresInDays.value ? Number.parseInt(expiresInDays.value, 10) : undefined;
    lastCreated.value = await invitationsApi.create({
      expiresInDays: Number.isFinite(days) && days! > 0 ? days : undefined,
      note: note.value || undefined,
    });
    note.value = '';
    await refresh();
  } finally {
    creating.value = false;
  }
}

async function del(id: string): Promise<void> {
  if (!confirm('Delete this invitation?')) return;
  await invitationsApi.delete(id);
  refresh();
}

function copy(code: string): void {
  navigator.clipboard?.writeText(code).catch(() => undefined);
}

function signupLink(code: string): string {
  return `${window.location.origin}/auth/signup?invite=${encodeURIComponent(code)}`;
}

onMounted(refresh);
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
    <h1 class="mb-6 text-2xl font-bold tracking-tight text-slate-100">Invitations</h1>

    <Alert v-if="error" variant="error">{{ error }}</Alert>

    <section v-if="auth.isAdmin" class="rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
      <h2 class="text-lg font-semibold text-slate-100">Create invitation</h2>
      <form class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3" @submit.prevent="create">
        <Field v-model="expiresInDays" label="Expires in (days)" type="number" hint="Blank = never expires" />
        <div class="sm:col-span-2"><Field v-model="note" label="Note (optional)" /></div>
        <div class="sm:col-span-3"><Btn type="submit" :loading="creating">Generate invitation</Btn></div>
      </form>
      <Alert v-if="lastCreated" variant="success" class="mt-4">
        Created. Share this signup link:
        <code class="ml-1 break-all">{{ signupLink(lastCreated.code) }}</code>
      </Alert>
    </section>

    <section class="mt-6 rounded-2xl bg-slate-900/60 ring-1 ring-slate-800">
      <header class="flex items-center justify-between border-b border-slate-800 p-5">
        <h2 class="text-lg font-semibold text-slate-100">Your invitations</h2>
        <button @click="refresh" class="text-sm text-slate-400 hover:text-slate-200">Refresh</button>
      </header>
      <div v-if="loading" class="flex justify-center py-12"><Spinner /></div>
      <ul v-else-if="list.length === 0" class="p-6 text-center text-sm text-slate-500">No invitations yet.</ul>
      <ul v-else class="divide-y divide-slate-800">
        <li v-for="inv in list" :key="inv.id" class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <code class="truncate rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200">{{ inv.code }}</code>
              <button @click="copy(inv.code)" class="text-xs text-emerald-400 hover:text-emerald-300">copy</button>
            </div>
            <p class="mt-1 text-xs text-slate-500">
              Created {{ new Date(inv.createdAt).toLocaleString() }}
              <template v-if="inv.expiresAt"> · expires {{ new Date(inv.expiresAt).toLocaleString() }}</template>
              <template v-if="inv.consumedAt"> · used by {{ inv.consumedBy?.email }} on {{ new Date(inv.consumedAt).toLocaleString() }}</template>
            </p>
            <p v-if="inv.note" class="mt-1 text-sm text-slate-300">{{ inv.note }}</p>
          </div>
          <div class="flex shrink-0 gap-2">
            <Btn v-if="!inv.consumedAt" variant="danger" size="sm" @click="del(inv.id)">Delete</Btn>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
