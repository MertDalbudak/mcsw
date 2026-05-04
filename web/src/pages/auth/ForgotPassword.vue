<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import Alert from '@/components/Alert.vue';

const email = ref('');
const sent = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  error.value = null;
  loading.value = true;
  try {
    await authApi.requestPasswordReset(email.value);
    sent.value = true;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Failed to send reset email';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <h2 class="mb-6 text-xl font-semibold text-slate-100">Reset password</h2>
  <template v-if="sent">
    <Alert variant="success">If that email is registered, a reset link has been sent.</Alert>
    <RouterLink :to="{ name: 'signin' }" class="mt-4 block text-center text-sm text-emerald-400 hover:text-emerald-300">
      Back to sign in
    </RouterLink>
  </template>
  <form v-else class="space-y-4" @submit.prevent="submit">
    <Field v-model="email" label="Email" type="email" autocomplete="email" required />
    <Alert v-if="error" variant="error">{{ error }}</Alert>
    <Btn type="submit" :loading="loading" block>Send reset link</Btn>
    <p class="text-center text-sm">
      <RouterLink :to="{ name: 'signin' }" class="text-slate-400 hover:text-slate-200">Back to sign in</RouterLink>
    </p>
  </form>
</template>
