#!/usr/bin/env node
/**
 * Smoke test de seguridad RLS (se ejecuta en CI).
 *
 * Verifica que el rol `anon` NO pueda leer las tablas sensibles que cerramos
 * en la fase 2 del hardening. Si una futura migración reabre el acceso por
 * error (ej. un GRANT SELECT olvidado, o un default privilege mal puesto),
 * este test falla y bloquea el deploy.
 *
 * Espera que cada tabla devuelva 401/403 (permission denied / 42501).
 * Si devuelve 200 con filas, significa que anon SÍ puede leerla -> FALLA.
 *
 * Requiere en el entorno:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("✗ Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY")
  process.exit(1)
}

// Tablas que anon NO debe poder leer directamente (acceso solo vía RPC).
const FORBIDDEN_TABLES = ["tables", "table_qr_codes"]

async function checkTableIsBlocked(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  })

  // Esperado: acceso denegado (401/403). PostgREST devuelve 401 para 42501.
  if (res.status === 401 || res.status === 403) {
    console.log(`✓ ${table}: acceso anónimo bloqueado (${res.status})`)
    return true
  }

  // Si responde 200, anon pudo leer -> agujero reabierto.
  if (res.ok) {
    const body = await res.text()
    console.error(`✗ ${table}: anon PUDO leer (status ${res.status}). Respuesta: ${body.slice(0, 200)}`)
    return false
  }

  // Otros códigos: lo tratamos como fallo para investigar.
  console.error(`✗ ${table}: status inesperado ${res.status}`)
  return false
}

async function main() {
  console.log("Smoke test RLS: verificando que anon no lea tablas sensibles...\n")

  const results = await Promise.all(FORBIDDEN_TABLES.map(checkTableIsBlocked))
  const allBlocked = results.every(Boolean)

  console.log("")
  if (allBlocked) {
    console.log("✓ Todas las tablas sensibles están protegidas frente a anon.")
    process.exitCode = 0
  } else {
    console.error("✗ Una o más tablas son legibles por anon. Revisá las policies/grants.")
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error("✗ Error ejecutando el smoke test:", err)
  process.exitCode = 1
})
