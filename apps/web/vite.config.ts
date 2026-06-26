import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const VITE_PORT = process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 4321;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: VITE_PORT,
  },
});
