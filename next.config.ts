import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Custom hostnames used to reach the dev server on the local network. Next 16
  // blocks its /_next dev resources from unknown origins by default, which makes
  // the page load forever when opened via a nice hostname rather than the raw IP.
  allowedDevOrigins: ["seesaw.home"],
};

export default nextConfig;
