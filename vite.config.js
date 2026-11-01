import { defineConfig } from "vite";

// host: true — игру можно открыть с телефона в той же Wi-Fi сети
export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 6000 },
});
