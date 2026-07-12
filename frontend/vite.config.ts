import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/items": "http://localhost:8888",
      "/users": "http://localhost:8888",
      "/auth": "http://localhost:8888",
      "/likes": "http://localhost:8888",
      "/demands": "http://localhost:8888",
      "/chat-rooms": "http://localhost:8888",
      "/health": "http://localhost:8888",
      "/uploads": "http://localhost:8888",
      "/socket.io": { target: "http://localhost:8888", ws: true },
    },
  },
});
