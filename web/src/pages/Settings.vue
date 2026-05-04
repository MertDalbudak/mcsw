<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { meApi } from '@/api/endpoints';
import type { MeResponse } from '@/api/types';
import { ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import Alert from '@/components/Alert.vue';
import Spinner from '@/components/Spinner.vue';

const auth = useAuthStore();
const me = ref<MeResponse | null>(null);
const loading = ref(true);

const currentPw = ref('');
const newPw = ref('');
const confirmPw = ref('');
const pwBusy = ref(false);
const pwMsg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null);

const mojangName = ref('');
const mojangBusy = ref(false);
const mojangMsg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try { me.value = await meApi.get(); } finally { loading.value = false; }
}

async function changePassword(): Promise<void> {
  pwMsg.value = null;
  if (newPw.value !== confirmPw.value) {
    pwMsg.value = { kind: 'err', text: "Passwords don't match" };
    return;
  }
  pwBusy.value = true;
  try {
    await meApi.changePassword(currentPw.value, newPw.value);
    currentPw.value = newPw.value = confirmPw.value = '';
    pwMsg.value = { kind: 'ok', text: 'Password updated' };
  } catch (err) {
    pwMsg.value = { kind: 'err', text: err instanceof ApiError ? err.message : 'Failed' };
  } finally {
    pwBusy.value = false;
  }
}

async function linkMojang(): Promise<void> {
  mojangMsg.value = null;
  mojangBusy.value = true;
  try {
    await meApi.linkMojang(mojangName.value.trim());
    mojangName.value = '';
    await load();
    await auth.fetchMe();
    mojangMsg.value = { kind: 'ok', text: 'Mojang account linked' };
  } catch (err) {
    mojangMsg.value = { kind: 'err', text: err instanceof ApiError ? err.message : 'Failed' };
  } finally {
    mojangBusy.value = false;
  }
}

async function unlinkMojang(): Promise<void> {
  if (!confirm('Unlink your Mojang account?')) return;
  mojangBusy.value = true;
  try {
    await meApi.unlinkMojang();
    await load();
    await auth.fetchMe();
  } finally {
    mojangBusy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
    <h1 class="mb-6 text-2xl font-bold tracking-tight text-slate-100">Settings</h1>

    <div v-if="loading" class="flex justify-center py-12"><Spinner size="lg" /></div>

    <template v-else-if="me">
      <!-- Account -->
      <section class="rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
        <h2 class="text-lg font-semibold text-slate-100">Account</h2>
        <dl class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-slate-500">Email</dt>
            <dd class="text-slate-200">{{ me.email }}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Status</dt>
            <dd class="text-slate-200">
              {{ me.emailVerified ? 'Verified' : 'Unverified' }}
              <span v-if="me.isAdmin" class="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300 ring-1 ring-emerald-500/30">admin</span>
            </dd>
          </div>
        </dl>
      </section>

      <!-- Mojang -->
      <section class="mt-6 rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
        <h2 class="text-lg font-semibold text-slate-100">Mojang account</h2>
        <p class="mt-1 text-sm text-slate-400">Link a single Mojang account to your profile.</p>

        <div v-if="me.mojang" class="mt-4 flex items-center gap-4">
          <img :src="`https://crafatar.com/avatars/${me.mojang.uuid}?size=64&overlay`" :alt="me.mojang.username" class="h-12 w-12 rounded-md ring-1 ring-slate-700" />
          <div class="flex-1">
            <p class="font-medium text-slate-100">{{ me.mojang.username }}</p>
            <p class="text-xs text-slate-500">{{ me.mojang.uuid }}</p>
          </div>
          <Btn variant="danger" size="sm" :loading="mojangBusy" @click="unlinkMojang">Unlink</Btn>
        </div>

        <form v-else class="mt-4 space-y-3" @submit.prevent="linkMojang">
          <Field v-model="mojangName" label="Mojang username" placeholder="e.g. Notch" required hint="3–16 chars, letters/digits/underscore." />
          <Btn type="submit" :loading="mojangBusy">Link account</Btn>
        </form>
        <Alert v-if="mojangMsg" :variant="mojangMsg.kind === 'ok' ? 'success' : 'error'" class="mt-4">{{ mojangMsg.text }}</Alert>
      </section>

      <!-- Password -->
      <section class="mt-6 rounded-2xl bg-slate-900/60 p-6 ring-1 ring-slate-800">
        <h2 class="text-lg font-semibold text-slate-100">Change password</h2>
        <form class="mt-4 grid grid-cols-1 gap-4 sm:max-w-md" @submit.prevent="changePassword">
          <Field v-model="currentPw" label="Current password" type="password" autocomplete="current-password" required />
          <Field v-model="newPw" label="New password" type="password" autocomplete="new-password" required hint="At least 10 chars, with a letter and number" />
          <Field v-model="confirmPw" label="Confirm new password" type="password" autocomplete="new-password" required />
          <Alert v-if="pwMsg" :variant="pwMsg.kind === 'ok' ? 'success' : 'error'">{{ pwMsg.text }}</Alert>
          <div><Btn type="submit" :loading="pwBusy">Update password</Btn></div>
        </form>
      </section>
    </template>
  </div>
</template>
