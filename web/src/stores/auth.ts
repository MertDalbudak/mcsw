import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, meApi } from '@/api/endpoints';
import type { MeResponse } from '@/api/types';
import { ApiError } from '@/api/client';

export const useAuthStore = defineStore('auth', () => {
  const me = ref<MeResponse | null>(null);
  const ready = ref(false);
  const loading = ref(false);

  const isSignedIn = computed(() => me.value != null);
  const isAdmin = computed(() => me.value?.isAdmin ?? false);
  const needsVerification = computed(() => me.value != null && !me.value.emailVerified);

  async function fetchMe(): Promise<void> {
    try {
      me.value = await meApi.get();
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) {
        // eslint-disable-next-line no-console
        console.warn('fetchMe failed:', err);
      }
      me.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function signin(email: string, password: string): Promise<void> {
    loading.value = true;
    try {
      await authApi.signin(email, password);
      await fetchMe();
    } finally {
      loading.value = false;
    }
  }

  async function signup(email: string, password: string, invitationCode?: string): Promise<void> {
    loading.value = true;
    try {
      await authApi.signup(email, password, invitationCode);
      await fetchMe();
    } finally {
      loading.value = false;
    }
  }

  async function signout(): Promise<void> {
    try {
      await authApi.signout();
    } finally {
      me.value = null;
    }
  }

  return { me, ready, loading, isSignedIn, isAdmin, needsVerification, fetchMe, signin, signup, signout };
});
