import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    allowedHosts: ["localhost", "127.0.0.1", "b8e2-103-145-244-176.ngrok-free.app"],
    // Proxy keeps the browser on one origin in dev, so the API needs no CORS
    // relaxation and headers behave exactly as they will in production.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
