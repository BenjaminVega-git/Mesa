import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  // Ignores globales: van PRIMERO para que apliquen a todo el resto.
  globalIgnores([
    // Defaults de eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos y código fuera de src que no debe pasar por el linter:
    ".claude/**",
    "android/**",
    "ios/**",
    "electron/**",
    "dist/**",
    "resources/**",
    "supabase/.temp/**",
    "scripts/**",
    "**/*.config.{js,mjs,cjs}",
  ]),
  ...nextVitals,
  ...nextTs,
]);

export default eslintConfig;
