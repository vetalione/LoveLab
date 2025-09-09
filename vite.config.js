import { defineConfig } from 'vite';

// Minimal config to pin a single dev port and fail fast if occupied.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // don't auto-increment; surface the conflict
  },
});
