import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The chat route reads the bundled sample photos from disk for vision
  // requests; make sure they ship with the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/chat": ["./public/samples/*.jpg"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
