import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { app: 'index.html', earth: 'earth-demo.html' } } },
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
});
