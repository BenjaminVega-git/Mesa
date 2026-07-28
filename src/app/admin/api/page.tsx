"use client"

import { useCallback, useEffect, useState } from "react"
import { Check } from "lucide-react"

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRow,
} from "@/services/api-key-service"

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function ApiPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [revokingId, setRevokingId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await listApiKeys()
    if (result.ok) {
      setKeys(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setCreateError(null)
    setCopied(false)
    const result = await createApiKey(name.trim())
    setCreating(false)
    if (result.ok) {
      setNewToken(result.data.token)
      setName("")
      void refresh()
    } else {
      setCreateError(result.error)
    }
  }

  async function handleCopy() {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function handleRevoke(key: ApiKeyRow) {
    if (key.revoked) return
    if (!window.confirm(`¿Revocar la API key "${key.name ?? key.keyPrefix}"? Esta acción no se puede deshacer.`)) {
      return
    }
    setRevokingId(key.id)
    const result = await revokeApiKey(key.id)
    setRevokingId(null)
    if (result.ok) {
      void refresh()
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900">API de inventario</h2>
        <p className="text-sm text-stone-600">
          Genera claves de acceso para consultar y actualizar tu inventario desde sistemas externos.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Nueva API key */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-stone-900">Nueva API key</h3>
        <p className="mt-1 text-xs text-stone-600">
          Dale un nombre descriptivo para identificar dónde se usa.
        </p>

        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="key-name" className="mb-1.5 block text-xs font-semibold text-stone-700">
              Nombre
            </label>
            <input
              id="key-name"
              type="text"
              required
              disabled={creating}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Integración bodega"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creando..." : "Crear"}
          </button>
        </form>

        {createError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {createError}
          </p>
        )}

        {newToken && (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-bold text-orange-900">API key creada ✓</p>
            <p className="mt-1 text-xs font-semibold text-orange-800">
              Guárdala ahora, no se vuelve a mostrar.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 break-all rounded-lg border border-orange-200 bg-white px-3 py-2 font-mono text-xs text-stone-900">
                {newToken}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-stone-800"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Copiado
                  </>
                ) : (
                  "Copiar"
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Tabla de keys */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-6 py-4">
          <h3 className="text-lg font-bold text-stone-900">Claves activas</h3>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-xs font-semibold text-stone-500 animate-pulse">
            Cargando claves...
          </div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm font-semibold text-stone-600">
            Aún no has creado ninguna API key.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-[11px] font-bold uppercase tracking-widest text-stone-500">
                  <th className="px-6 py-3">Nombre</th>
                  <th className="px-6 py-3">Prefijo</th>
                  <th className="px-6 py-3">Creada</th>
                  <th className="px-6 py-3">Último uso</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {keys.map((key) => (
                  <tr key={key.id} className="text-stone-700">
                    <td className="px-6 py-3 font-semibold text-stone-900">
                      {key.name ?? "Sin nombre"}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-stone-600">
                      {key.keyPrefix}…
                    </td>
                    <td className="px-6 py-3 text-xs">{formatDate(key.createdAt)}</td>
                    <td className="px-6 py-3 text-xs">{formatDate(key.lastUsedAt)}</td>
                    <td className="px-6 py-3">
                      {key.revoked ? (
                        <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-500 ring-1 ring-stone-200">
                          Revocada
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                          Activa
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        disabled={key.revoked || revokingId === key.id}
                        onClick={() => handleRevoke(key)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {revokingId === key.id ? "Revocando..." : "Revocar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Documentación */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-stone-900">Documentación</h3>
        <p className="mt-1 text-xs text-stone-600">
          Autentica cada petición con el header{" "}
          <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px] text-stone-800">
            Authorization: Bearer &lt;key&gt;
          </code>
          .
        </p>

        <div className="mt-4 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                GET
              </span>
              <code className="font-mono text-xs font-semibold text-stone-800">
                /api/v1/inventory
              </code>
            </div>
            <p className="mt-1 text-xs text-stone-600">Lista de insumos con stock actual, mínimo y precio.</p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-stone-900 p-4 font-mono text-[11px] leading-relaxed text-stone-100">
{`curl https://tumesaqr.com/api/v1/inventory \\
  -H "Authorization: Bearer <key>"`}
            </pre>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">
                POST
              </span>
              <code className="font-mono text-xs font-semibold text-stone-800">
                /api/v1/inventory/stock
              </code>
            </div>
            <p className="mt-1 text-xs text-stone-600">Actualiza el stock actual de un insumo.</p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-stone-900 p-4 font-mono text-[11px] leading-relaxed text-stone-100">
{`curl -X POST https://tumesaqr.com/api/v1/inventory/stock \\
  -H "Authorization: Bearer <key>" \\
  -H "Content-Type: application/json" \\
  -d '{ "ingredient_id": 1, "stock": 100 }'`}
            </pre>
          </div>
        </div>
      </section>
    </div>
  )
}
