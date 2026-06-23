import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Build to a static export (`out/`) so the FastAPI backend can serve the UI as plain
  // files — one process, one origin, no Next server in production. `next dev` ignores this.
  output: "export",
  // Export emits directory-per-route (`/ask/index.html`); trailing slashes let a static
  // file server resolve those cleanly.
  trailingSlash: true,
};

export default nextConfig;
