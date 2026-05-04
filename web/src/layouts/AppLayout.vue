<script setup lang="ts">
import { ref } from 'vue';
import { RouterView, RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import {
  Bars3Icon, XMarkIcon, HomeIcon, Cog6ToothIcon,
  TicketIcon, UsersIcon, ServerStackIcon, ArrowRightOnRectangleIcon,
  ChartBarIcon, ClipboardDocumentListIcon,
} from '@heroicons/vue/24/outline';
import Toasts from '@/components/Toasts.vue';

const auth = useAuthStore();
const router = useRouter();
const sidebarOpen = ref(false);

const baseNav = [
  { name: 'Dashboard', to: { name: 'dashboard' }, icon: HomeIcon },
  { name: 'Invitations', to: { name: 'invitations' }, icon: TicketIcon },
  { name: 'Settings', to: { name: 'settings' }, icon: Cog6ToothIcon },
];
const adminNav = [
  { name: 'Users', to: { name: 'admin.users' }, icon: UsersIcon },
  { name: 'mcsm Instances', to: { name: 'admin.mcsm' }, icon: ServerStackIcon },
  { name: 'System', to: { name: 'admin.system' }, icon: ChartBarIcon },
  { name: 'Audit log', to: { name: 'admin.audit' }, icon: ClipboardDocumentListIcon },
];

async function signout(): Promise<void> {
  await auth.signout();
  router.push({ name: 'signin' });
}
</script>

<template>
  <div class="flex h-full">
    <!-- Sidebar (desktop) -->
    <aside class="hidden w-64 flex-col border-r border-slate-800 bg-slate-900/40 md:flex">
      <div class="flex h-16 items-center px-6 border-b border-slate-800">
        <span class="text-xl">⛏</span>
        <span class="ml-2 text-lg font-semibold tracking-tight">mcsw</span>
      </div>
      <nav class="flex-1 overflow-y-auto p-3">
        <div class="space-y-1">
          <RouterLink
            v-for="item in baseNav" :key="item.name" :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            active-class="bg-slate-800 text-white"
          >
            <component :is="item.icon" class="h-5 w-5" />
            {{ item.name }}
          </RouterLink>
        </div>
        <div v-if="auth.isAdmin" class="mt-6">
          <p class="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Admin</p>
          <div class="mt-2 space-y-1">
            <RouterLink
              v-for="item in adminNav" :key="item.name" :to="item.to"
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              active-class="bg-slate-800 text-white"
            >
              <component :is="item.icon" class="h-5 w-5" />
              {{ item.name }}
            </RouterLink>
          </div>
        </div>
      </nav>
      <div class="border-t border-slate-800 p-3">
        <Menu as="div" class="relative">
          <MenuButton class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-800">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
              {{ auth.me?.email?.[0]?.toUpperCase() }}
            </div>
            <span class="truncate text-left">{{ auth.me?.email }}</span>
          </MenuButton>
          <MenuItems class="absolute bottom-full left-0 mb-2 w-full origin-bottom rounded-lg bg-slate-800 py-1 ring-1 ring-slate-700 shadow-lg focus:outline-none">
            <MenuItem v-slot="{ active }">
              <button
                @click="signout"
                :class="['flex w-full items-center gap-2 px-3 py-2 text-sm', active ? 'bg-slate-700' : '']"
              >
                <ArrowRightOnRectangleIcon class="h-4 w-4" />
                Sign out
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>
    </aside>

    <!-- Mobile top bar -->
    <header class="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur md:hidden">
      <button @click="sidebarOpen = true" class="-ml-1 rounded-md p-2 text-slate-300 hover:bg-slate-800" aria-label="Open menu">
        <Bars3Icon class="h-6 w-6" />
      </button>
      <span class="ml-2 text-lg font-semibold tracking-tight">mcsw</span>
    </header>

    <!-- Mobile drawer -->
    <Transition
      enter-active-class="duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="sidebarOpen" class="fixed inset-0 z-40 bg-slate-950/70 md:hidden" @click="sidebarOpen = false" />
    </Transition>
    <Transition
      enter-active-class="duration-200 ease-out"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="duration-150 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <aside
        v-if="sidebarOpen"
        class="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-900 ring-1 ring-slate-800 md:hidden"
      >
        <div class="flex h-14 items-center justify-between px-4 border-b border-slate-800">
          <span class="text-lg font-semibold">⛏ mcsw</span>
          <button @click="sidebarOpen = false" class="rounded-md p-2 text-slate-300 hover:bg-slate-800" aria-label="Close menu">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <nav class="flex-1 overflow-y-auto p-3">
          <div class="space-y-1">
            <RouterLink
              v-for="item in baseNav" :key="item.name" :to="item.to" @click="sidebarOpen = false"
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              active-class="bg-slate-800 text-white"
            >
              <component :is="item.icon" class="h-5 w-5" />
              {{ item.name }}
            </RouterLink>
          </div>
          <div v-if="auth.isAdmin" class="mt-6">
            <p class="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Admin</p>
            <div class="mt-2 space-y-1">
              <RouterLink
                v-for="item in adminNav" :key="item.name" :to="item.to" @click="sidebarOpen = false"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                active-class="bg-slate-800 text-white"
              >
                <component :is="item.icon" class="h-5 w-5" />
                {{ item.name }}
              </RouterLink>
            </div>
          </div>
        </nav>
        <div class="border-t border-slate-800 p-3">
          <button
            @click="signout"
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <ArrowRightOnRectangleIcon class="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>
    </Transition>

    <!-- Main -->
    <main class="flex-1 overflow-y-auto pt-14 pb-[var(--safe-bottom)] md:pt-0">
      <div v-if="auth.needsVerification" class="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
        Please verify your email — check your inbox for the link.
      </div>
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <Toasts />
  </div>
</template>
