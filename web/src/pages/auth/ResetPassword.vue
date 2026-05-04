<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import Alert from '@/components/Alert.vue';

const route = useRoute();
const router = useRouter();
const token = computed(() => (route.query.token as string | undefined) ?? '');
const password = ref('');
const confirm = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const done = ref(false);

async function submit(): Promise<void> {
  error.value = null;
  if (!token.value) { error.value = 'Missing reset token'; return; }
  if (password.value !== confirm.value) { error.value = "Passwords don't match"; return; }
  loading.value = true;
  try {
    await authApi.confirmPasswordReset(token.value, password.value);
    done.value = true;
    setTimeout(() => router.replace({ name: 'signin' }), 1500);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Reset failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <h2 class="mb-6 text-xl font-semibold text-slate-100">Choose a new password</h2>
  <Alert v-if="done" variant="success">Password updated. Redirecting…</Alert>
  <form v-else class="space-y-4" @submit.prevent="submit">
    <Field v-model="password" label="New password" type="password" autocomplete="new-password" required
           hint="At least 10 chars, including a letter and a number" />
    <Field v-model="confirm" label="Confirm password" type="password" autocomplete="new-password" required />
    <Alert v-if="error" variant="error">{{ error }}</Alert>
    <Btn type="submit" :loading="loading" block>Update password</Btn>
    <p class="text-center text-sm">
      <RouterLink :to="{ name: 'signin' }" class="text-slate-400 hover:text-slate-200">Back to sign in</RouterLink>
    </p>
  </form>
</template>
