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

    const value = rawValue
      .replace(/^(['"])(.*)\1$/, "$2")
      .replace(/\\n/g, "\n")

    process.env[key] = value
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Faltan variables requeridas:")
  if (!supabaseUrl) console.error("- NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL")
  if (!serviceRoleKey) console.error("- SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const jsonOutput = process.argv.includes("--json")
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function listAuthUsers() {
  const users = []
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) throw error

    const batch = data?.users ?? []
    users.push(...batch)

    if (batch.length < perPage) break
    page += 1
  }

  return users
}

async function listProfiles(authIds) {
  const profilesByAuthId = new Map()
  const chunkSize = 500

  for (let i = 0; i < authIds.length; i += chunkSize) {
    const ids = authIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from("users")
      .select("id, auth_user_id, user_name, user_email, role_id, restaurant_id, must_change_password")
      .in("auth_user_id", ids)

    if (error) throw error

    for (const profile of data ?? []) {
      profilesByAuthId.set(profile.auth_user_id, profile)
    }
  }

  return profilesByAuthId
}

let authUsers
let profilesByAuthId

try {
  authUsers = await listAuthUsers()
  profilesByAuthId = await listProfiles(authUsers.map((user) => user.id))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  const cause = error?.cause
  const causeCode = cause?.code ? ` (${cause.code})` : ""

  console.error(`No se pudo obtener la lista de usuarios: ${message}${causeCode}`)
  if (cause?.hostname) {
    console.error(`Host: ${cause.hostname}`)
  }
  process.exit(1)
}

const rows = authUsers.map((user) => {
  const profile = profilesByAuthId.get(user.id)

  return {
    auth_user_id: user.id,
    email: user.email ?? profile?.user_email ?? "",
    confirmed_at: user.confirmed_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    public_user_id: profile?.id ?? null,
    name: profile?.user_name ?? user.user_metadata?.name ?? "",
    role_id: profile?.role_id ?? null,
    restaurant_id: profile?.restaurant_id ?? null,
    must_change_password: profile?.must_change_password ?? null,
  }
})

if (jsonOutput) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.table(rows)
  console.log(`Total usuarios Auth: ${authUsers.length}`)
}
