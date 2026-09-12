import { defineConfig } from "vite";
import { BRAND } from "./shared/domain";
export default defineConfig({
  plugins: [
    {
      name: "brand-title",
      transformIndexHtml: (html) => html.replace("__APP_TITLE__", BRAND.name),
    },
  ],
  build: { outDir: "dist" },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["localhost"],
    watch: {
      ignored: [
        "**/test-results/**",
        "**/playwright-report/**",
        "**/data/**",
        "**/docs/**",
      ],
    },
  },
});
