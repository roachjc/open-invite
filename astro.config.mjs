import { defineConfig, fontProviders } from "astro/config";
import node from "@astrojs/node";
import { loadEnv } from "vite";

// Server code reads process.env directly. Load .env files into it during dev and
// build so local settings like OPENAI_API_KEY work without extra wiring. Real
// environment variables still take precedence.
const mode = process.argv.includes("dev") ? "development" : "production";
for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "")))
  process.env[key] ??= value;

// Vite restricts which hostnames the dev server answers. Explicitly allow only
// the private hostnames used to preview this app from another device.
const allowedHosts = (process.env.OPEN_INVITE_DEV_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: { host: true, port: 3000, allowedHosts },
  devToolbar: { enabled: false },
  // Inline the stylesheet so first paint needs no extra round trip. HTML is
  // compressed by the middleware; static files are served uncompressed.
  build: { inlineStylesheets: "always" },
  fonts: [
    {
      provider: fontProviders.google(),
      name: "IBM Plex Sans",
      cssVariable: "--font-sans",
      weights: [400, 500, 600, 700],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["Helvetica Neue", "Arial", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "IBM Plex Mono",
      cssVariable: "--font-mono",
      weights: [400, 500, 600],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["ui-monospace", "monospace"],
    },
    {
      provider: fontProviders.google(),
      name: "Manrope",
      cssVariable: "--font-brand",
      weights: [800],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["sans-serif"],
    },
  ],
});
