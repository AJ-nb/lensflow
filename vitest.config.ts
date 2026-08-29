import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.output/**", "**/dist/**"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
