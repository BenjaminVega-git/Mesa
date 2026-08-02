#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const envPath = resolve(process.cwd(), ".env.local")

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed)
    if (!match) continue

    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue

    process.env[key] = rawValue
      .replace(/^(['"])(.*)\1$/, "$2")
      .replace(/\\n/g, "\n")
  }
}

function getArgValue(name, fallback = null) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] ?? fallback
}

const positional = process.argv.slice(2).filter((arg, index, args) => {
  if (arg.startsWith("--")) return false
  return !args[index - 1]?.startsWith("--")
})

const tableName = positional[0]
const limit = Math.min(Math.max(Number(getArgValue("--limit", 50)) || 50, 1), 500)
const select = getArgValue("--select", "*")
const jsonOutput = process.argv.includes("--json")

if (!tableName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
  console.error("Uso: npm run tables:list -- <tabla> [--limit 50] [--select '*'] [--json]")
  console.error("El nombre de tabla solo puede contener letras, numeros y guion bajo.")
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Faltan variables requeridas:")
  if (!supabaseUrl) console.error("- NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL")
  if (!serviceRoleKey) console.error("- SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const { data, error } = await supabase
  .from(tableName)
  .select(select)
  .limit(limit)

if (error) {
  console.error(`No se pudo leer public.${tableName}: ${error.message}`)
  process.exit(1)
}

if (jsonOutput) {
  console.log(JSON.stringify(data ?? [], null, 2))
} else {
  console.table(data ?? [])
  console.log(`Total mostrado public.${tableName}: ${(data ?? []).length}`)
}
