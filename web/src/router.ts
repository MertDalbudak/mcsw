import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'dashboard', component: () => import('@/pages/Dashboard.vue') },
      {
        path: 'slot/:instanceId/:slot',
        name: 'slot',
        component: () => import('@/pages/SlotDetail.vue'),
        props: true,
      },
      { path: 'settings', name: 'settings', component: () => import('@/pages/Settings.vue') },
      { path: 'invitations', name: 'invitations', component: () => import('@/pages/Invitations.vue') },
      {
        path: 'admin',
        meta: { requiresAdmin: true },
        children: [
          { path: 'users', name: 'admin.users', component: () => import('@/pages/admin/Users.vue') },
          { path: 'mcsm', name: 'admin.mcsm', component: () => import('@/pages/admin/McsmInstances.vue') },
          { path: 'system', name: 'admin.system', component: () => import('@/pages/admin/System.vue') },
          { path: 'audit', name: 'admin.audit', component: () => import('@/pages/admin/AuditLog.vue') },
          { path: 'grants/:userId', name: 'admin.grants', component: () => import('@/pages/admin/UserGrants.vue'), props: true },
        ],
      },
    ],
  },
  {
    path: '/auth',
    component: () => import('@/layouts/AuthLayout.vue'),
    children: [
      { path: 'signin', name: 'signin', component: () => import('@/pages/auth/SignIn.vue') },
      { path: 'signup', name: 'signup', component: () => import('@/pages/auth/SignUp.vue') },
      { path: 'forgot', name: 'forgot', component: () => import('@/pages/auth/ForgotPassword.vue') },
      { path: 'reset', name: 'reset', component: () => import('@/pages/auth/ResetPassword.vue') },
      { path: 'verify-email', name: 'verify', component: () => import('@/pages/auth/VerifyEmail.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFound.vue') },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth);
  const requiresAdmin = to.matched.some((r) => r.meta.requiresAdmin);

  if (requiresAuth && !auth.isSignedIn) {
    return { name: 'signin', query: { next: to.fullPath } };
  }
  if (requiresAdmin && !auth.isAdmin) {
    return { name: 'dashboard' };
  }
  // If signed in, don't show auth pages.
  if ((to.name === 'signin' || to.name === 'signup') && auth.isSignedIn) {
    return { name: 'dashboard' };
  }
});
