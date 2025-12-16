import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";
import { existsSync } from "fs";

export default defineConfig({
  plugins: [
    // Only use TanStack Router plugin if routes directory exists
    existsSync(path.resolve(__dirname, "./src/routes")) && TanStackRouterVite(),
    react(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "es",
    plugins: () => [react()],
    rollupOptions: {
      output: {
        // Ensure worker files output as .js, not .ts
        entryFileNames: "[name]-[hash].js",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "https://cratemusic.duckdns.org",
        changeOrigin: true,
        // Don't rewrite - backend routes include /api prefix
      },
    },
  },
});
