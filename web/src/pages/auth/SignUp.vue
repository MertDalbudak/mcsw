<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { ApiError } from '@/api/client';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import Alert from '@/components/Alert.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const confirm = ref('');
const invitationCode = ref<string>((route.query.invite as string) ?? '');
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  error.value = null;
  if (password.value !== confirm.value) {
    error.value = "Passwords don't match";
    return;
  }
  try {
    await auth.signup(email.value, password.value, invitationCode.value || undefined);
    router.replace('/');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Sign-up failed';
  }
}
</script>

<template>
  <h2 class="mb-6 text-xl font-semibold text-slate-100">Create account</h2>
  <form class="space-y-4" @submit.prevent="submit">
    <Field v-model="invitationCode" label="Invitation code" required />
    <Field v-model="email" label="Email" type="email" autocomplete="email" required />
    <Field v-model="password" label="Password" type="password" autocomplete="new-password" required
           hint="At least 10 chars, including a letter and a number" />
    <Field v-model="confirm" label="Confirm password" type="password" autocomplete="new-password" required />
    <Alert v-if="error" variant="error">{{ error }}</Alert>
    <Btn type="submit" :loading="auth.loading" block>Create account</Btn>
  </form>
  <p class="mt-4 text-center text-sm text-slate-400">
    Already have an account?
    <RouterLink :to="{ name: 'signin' }" class="text-emerald-400 hover:text-emerald-300">Sign in</RouterLink>
  </p>
</template>
