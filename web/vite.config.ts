import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env["VITE_API_TARGET"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        changeOrigin: true,
        target: apiTarget,
      },
    },
  },
});
