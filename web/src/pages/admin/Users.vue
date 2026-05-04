<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminUsersApi } from '@/api/endpoints';
import type { UserDto } from '@/api/types';
import Spinner from '@/components/Spinner.vue';

const users = ref<UserDto[]>([]);
const loading = ref(true);

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const r = await adminUsersApi.list();
    users.value = r.users;
  } finally {
    loading.value = false;
  }
}

async function setAdmin(u: UserDto, isAdmin: boolean): Promise<void> {
  await adminUsersApi.update(u.id, { isAdmin }).catch((e) => alert(e.message));
  refresh();
}
async function setDisabled(u: UserDto, isDisabled: boolean): Promise<void> {
  await adminUsersApi.update(u.id, { isDisabled }).catch((e) => alert(e.message));
  refresh();
}
async function del(u: UserDto): Promise<void> {
  if (!confirm(`Delete ${u.email}? This is permanent.`)) return;
  await adminUsersApi.delete(u.id).catch((e) => alert(e.message));
  refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <h1 class="mb-6 text-2xl font-bold tracking-tight text-slate-100">Users</h1>
    <div v-if="loading" class="flex justify-center py-12"><Spinner /></div>
    <div v-else class="overflow-hidden rounded-2xl bg-slate-900/60 ring-1 ring-slate-800">
      <table class="min-w-full divide-y divide-slate-800 text-sm">
        <thead class="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-4 py-3 text-left font-medium">Email</th>
            <th class="px-4 py-3 text-left font-medium">Mojang</th>
            <th class="px-4 py-3 text-left font-medium">Status</th>
            <th class="px-4 py-3 text-left font-medium">Last login</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr v-for="u in users" :key="u.id" class="hover:bg-slate-900">
            <td class="px-4 py-3 text-slate-200">
              {{ u.email }}
              <span v-if="u.isAdmin" class="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300 ring-1 ring-emerald-500/30">admin</span>
              <span v-if="u.isDisabled" class="ml-2 rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-300 ring-1 ring-rose-500/30">disabled</span>
            </td>
            <td class="px-4 py-3 text-slate-400">
              <template v-if="u.mojang">{{ u.mojang.username }}</template>
              <span v-else class="italic text-slate-600">—</span>
            </td>
            <td class="px-4 py-3 text-slate-400">
              {{ u.emailVerified ? 'verified' : 'unverified' }}
            </td>
            <td class="px-4 py-3 text-slate-400">
              {{ u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap justify-end gap-2">
                <RouterLink :to="{ name: 'admin.grants', params: { userId: u.id } }" class="text-xs text-emerald-400 hover:text-emerald-300">
                  Grants →
                </RouterLink>
                <button v-if="!u.isAdmin" @click="setAdmin(u, true)" class="text-xs text-slate-400 hover:text-slate-200">make admin</button>
                <button v-else @click="setAdmin(u, false)" class="text-xs text-slate-400 hover:text-slate-200">demote</button>
                <button v-if="!u.isDisabled" @click="setDisabled(u, true)" class="text-xs text-amber-400 hover:text-amber-300">disable</button>
                <button v-else @click="setDisabled(u, false)" class="text-xs text-emerald-400 hover:text-emerald-300">enable</button>
                <button @click="del(u)" class="text-xs text-rose-400 hover:text-rose-300">delete</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
