import type { NextConfig } from "next";

// Next's development assets are restricted by origin. Explicitly allow only the
// private hostnames used to preview this app from another device.
const allowedDevOrigins = (process.env.OPEN_INVITE_DEV_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const config: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  allowedDevOrigins,
};
export default config;
