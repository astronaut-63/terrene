import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { app: 'index.html', earth: 'earth-demo.html' } } },
  server: { proxy: { '/api': 'http://localhost:3002' } },
  test: {
    environment: "jsdom",
    include: ['src/**/*.test.tsx'],
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
});
