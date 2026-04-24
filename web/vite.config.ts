import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET;

  return {
    envDir: "..",
    plugins: [
      react(),
      tailwind(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
        manifest: {
          name: "Teltonika SMS",
          short_name: "TeltSMS",
          description: "Command Teltonika FMT trackers via Flespi/Sipgate",
          start_url: "/",
          display: "standalone",
          background_color: "#0b0f17",
          theme_color: "#0b0f17",
          icons: [
            { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
        },
      }),
    ],
    server: {
      host: true,
      proxy: {
        ...(apiProxyTarget
          ? { "/api": { target: apiProxyTarget, changeOrigin: true } }
          : {}),
      },
    },
  };
});
