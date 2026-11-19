import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Hash routing plus a relative base so `dist/` can be hosted on any static server.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { host: "0.0.0.0", port: 43123, strictPort: true },
  preview: { host: "0.0.0.0", port: 43123, strictPort: true },
})
