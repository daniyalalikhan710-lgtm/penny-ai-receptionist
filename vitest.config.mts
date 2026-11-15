import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
    // Server modules import "server-only"; this condition makes it a no-op in tests.
    conditions: ["react-server"],
  },
  ssr: { resolve: { conditions: ["react-server"] } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { PENNY_REPLAY_PACE: "0", PENNY_PAY_DELAY_MS: "0" },
  },
});
