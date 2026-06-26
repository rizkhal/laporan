import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = env.VITE_PORT ? parseInt(env.VITE_PORT) : 5173;

  return {
    plugins: [react(), tailwindcss()],
    server: { port },
  };
});
