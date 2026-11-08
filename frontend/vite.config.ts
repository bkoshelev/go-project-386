import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.VITE_BACKEND_URL;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: backend
      ? Object.fromEntries(["/api", "/healthz", "/readyz"].map((path) => [path, backend]))
      : undefined,
  },
});
