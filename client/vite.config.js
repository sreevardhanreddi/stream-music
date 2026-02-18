import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/socket.io": {
        target: process.env.VITE_SOCKET_ORIGIN,
        ws: true,
      },
      "/audio": {
        target: process.env.VITE_AUDIO_BASE_URL,
      },
    },
  },
});
