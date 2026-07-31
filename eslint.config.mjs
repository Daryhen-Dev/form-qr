import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Compensating static control for spec scenario F.4 (server-only boundary).
  // Next.js 16 Turbopack resolves the react-server export condition at build time,
  // so importing server-only modules from client bundles does NOT produce a build
  // error. This rule makes such an import a lint error (and therefore a CI failure),
  // replacing the missing build-time check.
  // Scope: app/**  but NOT app/api/** (Route Handlers are server-side and may
  // legitimately call services, which in turn call the backend layer).
  {
    files: ["app/**/*.{ts,tsx}"],
    ignores: ["app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/lib/db",
            "@/lib/db/*",
            "@/lib/repositories",
            "@/lib/repositories/*",
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
