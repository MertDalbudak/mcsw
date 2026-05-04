<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { authApi } from '@/api/endpoints';
import { useAuthStore } from '@/stores/auth';
import { ApiError } from '@/api/client';
import Spinner from '@/components/Spinner.vue';
import Alert from '@/components/Alert.vue';

const route = useRoute();
const auth = useAuthStore();
const status = ref<'pending' | 'ok' | 'error'>('pending');
const message = ref('');

onMounted(async () => {
  const token = route.query.token as string | undefined;
  if (!token) {
    status.value = 'error';
    message.value = 'Missing token';
    return;
  }
  try {
    await authApi.verifyEmail(token);
    await auth.fetchMe();
    status.value = 'ok';
  } catch (err) {
    status.value = 'error';
    message.value = err instanceof ApiError ? err.message : 'Verification failed';
  }
});
</script>

<template>
  <h2 class="mb-6 text-xl font-semibold text-slate-100">Verifying email</h2>
  <div v-if="status === 'pending'" class="flex justify-center py-6"><Spinner size="lg" /></div>
  <Alert v-else-if="status === 'ok'" variant="success">Email verified. You're all set.</Alert>
  <Alert v-else variant="error">{{ message }}</Alert>
  <RouterLink :to="{ name: 'dashboard' }" class="mt-4 block text-center text-sm text-emerald-400 hover:text-emerald-300">
    Continue
  </RouterLink>
</template>
