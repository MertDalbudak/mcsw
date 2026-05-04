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
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  error.value = null;
  try {
    await auth.signin(email.value, password.value);
    const next = (route.query.next as string | undefined) || '/';
    router.replace(next);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Sign-in failed';
  }
}
</script>

<template>
  <h2 class="mb-6 text-xl font-semibold text-slate-100">Sign in</h2>
  <form class="space-y-4" @submit.prevent="submit">
    <Field v-model="email" label="Email" type="email" autocomplete="email" required />
    <Field v-model="password" label="Password" type="password" autocomplete="current-password" required />
    <Alert v-if="error" variant="error">{{ error }}</Alert>
    <Btn type="submit" :loading="auth.loading" block>Sign in</Btn>
  </form>
  <div class="mt-4 flex flex-col gap-2 text-sm">
    <RouterLink :to="{ name: 'forgot' }" class="text-emerald-400 hover:text-emerald-300">Forgot password?</RouterLink>
    <p class="text-slate-400">
      Have an invitation?
      <RouterLink :to="{ name: 'signup' }" class="text-emerald-400 hover:text-emerald-300">Create an account</RouterLink>
    </p>
  </div>
</template>
