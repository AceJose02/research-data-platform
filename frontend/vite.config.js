import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // During development the Flask API runs separately; proxy /api to it so the
  // browser sees one origin (no CORS setup, no hard-coded URLs in the code).
  const target = env.VITE_PROXY_TARGET || "http://127.0.0.1:5000";
  const proxy = { "/api": { target, changeOrigin: true } };

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "charts";
            return undefined;
          },
        },
      },
    },
  };
});
