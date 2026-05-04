import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import { ensureCsrf } from './api/client';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Bootstrap auth + CSRF before mounting so route guards see the truth.
(async (): Promise<void> => {
  await ensureCsrf();
  await useAuthStore().fetchMe();
  app.mount('#app');
})();
