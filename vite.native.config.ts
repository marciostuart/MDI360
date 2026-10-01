import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// No server/router plugin: the APK ships this renderer, not the remote /tela.
export default defineConfig({
  root: "native-player",
  base: "/__native-ui/",
  plugins: [tailwindcss(), react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "../dist/native-player", emptyOutDir: true, target: "chrome90" },
});
