import { spawn } from "node:child_process"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const envFile = readEnvFile(".env.local")
const localSupabase = getLocalSupabaseConfig()
const args = process.argv.slice(2)
const firstArgIsMode = ["auto", "local", "remote"].includes(args[0])
const mode = firstArgIsMode ? args[0] : "auto"
const nextArgs = firstArgIsMode ? args.slice(1) : args

if (args[0] && !firstArgIsMode && !args[0].startsWith("-")) {
  console.error(`Modo invalido: ${args[0]}. Usa auto, local o remote.`)
  process.exit(1)
}

const localReady = mode === "remote" ? false : await isSupabaseReady(localSupabase.url)

if (mode === "local" && !localReady) {
  console.error(`Supabase local no responde en ${localSupabase.url}.`)
  console.error("Levanta la base local con: npx supabase start")
  process.exit(1)
}

const useLocal = mode === "local" || (mode === "auto" && localReady)
const nextEnv = {
  ...process.env,
  ...(useLocal
      ? {
        MESA_LOCAL_SUPABASE: "1",
        NEXT_PUBLIC_MESA_SUPABASE_PROXY: "1",
        NEXT_PUBLIC_SUPABASE_URL: localSupabase.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: localSupabase.anonKey,
      }
    : {
        ...envFile,
        MESA_LOCAL_SUPABASE: "0",
        NEXT_PUBLIC_MESA_SUPABASE_PROXY: "0",
      }),
}

console.log(
  useLocal
    ? `Supabase dev: local (${localSupabase.url})`
    : `Supabase dev: remoto (${maskUrl(nextEnv.NEXT_PUBLIC_SUPABASE_URL)})`
)

const nextBin = resolve("node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next")
const child = spawn(nextBin, ["dev", ...nextArgs], {
  env: nextEnv,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

async function isSupabaseReady(baseUrl) {
  if (!baseUrl || !localSupabase.anonKey) return false

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 700)
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/`, {
      headers: {
        apikey: localSupabase.anonKey,
        Authorization: `Bearer ${localSupabase.anonKey}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.status < 500
  } catch {
    return false
  }
}

function getLocalSupabaseConfig() {
  const fromEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_LOCAL_ANON_KEY,
  }

  try {
    const output = execFileSync("npx", ["supabase", "status", "--output", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2500,
    })
    const statusEnv = parseEnv(output)

    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_LOCAL_URL ?? statusEnv.API_URL ?? fromEnv.url,
      anonKey: statusEnv.PUBLISHABLE_KEY ?? statusEnv.ANON_KEY ?? fromEnv.anonKey,
    }
  } catch {
    return fromEnv
  }
}

function readEnvFile(fileName) {
  const filePath = resolve(fileName)
  if (!existsSync(filePath)) return {}

  return parseEnv(readFileSync(filePath, "utf8"))
}

function parseEnv(contents) {
  return contents
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) return env

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!match) return env

      const [, key, rawValue] = match
      env[key] = rawValue.replace(/^["']|["']$/g, "")
      return env
    }, {})
}

function maskUrl(value) {
  if (!value) return "sin NEXT_PUBLIC_SUPABASE_URL"

  try {
    const url = new URL(value)
    return `${url.origin}`
  } catch {
    return "[url invalida]"
  }
}
