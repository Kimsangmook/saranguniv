import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/attendance/verify", destination: "/attendance", permanent: true },
      { source: "/attendance/check-in", destination: "/attendance", permanent: true },
    ];
  },
};

export default nextConfig;
