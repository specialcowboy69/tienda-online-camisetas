import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15000
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
