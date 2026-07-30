"use client"

import { useEffect, useRef, useState } from "react"
import {
  getDteCredentials,
  saveCertificate,
  deleteCertificate,
  saveCaf,
  deleteCaf,
  type DteCredentials,
} from "@/services/dte-credentials-service"
import { DTE_LABEL_BY_CODE } from "@/lib/dte/types"

const INPUT_CLASS =
  "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
const LABEL_CLASS = "mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500"

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "")
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsText(file)
  })
}

function textToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

function fmt(v: string | null): string {
  if (!v) return "—"
  return new Date(v).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })
}

export function DteCredentialsSection() {
  const [creds, setCreds] = useState<DteCredentials | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  // Certificado
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certPassword, setCertPassword] = useState("")
  const [certExpires, setCertExpires] = useState("")
  const [savingCert, setSavingCert] = useState(false)
  const certInputRef = useRef<HTMLInputElement>(null)

  // CAF
  const [savingCaf, setSavingCaf] = useState(false)
  const cafInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const r = await getDteCredentials()
    if (r.ok) setCreds(r.data)
    setLoading(false)
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  async function handleSaveCert() {
    if (savingCert) return
    if (!certFile) {
      setFeedback({ kind: "error", message: "Seleccioná el archivo del certificado (.pfx o .p12)." })
      return
    }
    setSavingCert(true)
    setFeedback(null)
    try {
      const b64 = await fileToBase64(certFile)
      const r = await saveCertificate({
        certBase64: b64,
        password: certPassword,
        filename: certFile.name,
        expires: certExpires || null,
      })
      if (!r.ok) {
        setFeedback({ kind: "error", message: r.error })
        return
      }
      setFeedback({ kind: "ok", message: "Certificado guardado de forma cifrada." })
      setCertFile(null)
      setCertPassword("")
      setCertExpires("")
      if (certInputRef.current) certInputRef.current.value = ""
      await load()
    } finally {
      setSavingCert(false)
    }
  }

  async function handleRemoveCert() {
    const r = await deleteCertificate()
    if (!r.ok) {
      setFeedback({ kind: "error", message: r.error })
      return
    }
    setFeedback({ kind: "ok", message: "Certificado eliminado." })
    await load()
  }

  async function handleAddCaf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || savingCaf) return
    setSavingCaf(true)
    setFeedback(null)
    try {
      const text = await fileToText(file)
      const td = text.match(/<TD>\s*(\d+)\s*<\/TD>/)?.[1]
      const d = text.match(/<D>\s*(\d+)\s*<\/D>/)?.[1]
      const h = text.match(/<H>\s*(\d+)\s*<\/H>/)?.[1]
      if (!td) {
        setFeedback({ kind: "error", message: "El archivo no parece un CAF válido del SII (falta el tipo de documento)." })
        return
      }
      const r = await saveCaf({
        docType: Number(td),
        cafBase64: textToBase64(text),
        folioDesde: d ? Number(d) : null,
        folioHasta: h ? Number(h) : null,
        filename: file.name,
      })
      if (!r.ok) {
        setFeedback({ kind: "error", message: r.error })
        return
      }
      setFeedback({
        kind: "ok",
        message: `CAF cargado: ${DTE_LABEL_BY_CODE[Number(td)] ?? `Tipo ${td}`}${d && h ? ` (folios ${d}–${h})` : ""}.`,
      })
      await load()
    } finally {
      setSavingCaf(false)
    }
  }

  async function handleDeleteCaf(id: number) {
    const r = await deleteCaf(id)
    if (!r.ok) {
      setFeedback({ kind: "error", message: r.error })
      return
    }
    await load()
  }

  const cert = creds?.certificate ?? null

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Certificado digital y folios (CAF)</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Documentos que el SII exige para emitir. Se guardan cifrados y solo se usan para firmar y
        timbrar tus boletas y facturas.
      </p>

      {/* Certificado digital */}
      <div className="mt-5 rounded-2xl border border-stone-200 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Certificado digital (.pfx / .p12)</p>
        {loading ? (
          <p className="mt-3 text-sm text-stone-400 animate-pulse">Cargando…</p>
        ) : cert ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
            <div className="text-sm">
              <p className="font-bold text-emerald-800">Certificado cargado ✓</p>
              <p className="text-xs text-emerald-700/90">
                {cert.filename ?? "certificado"} · Vence: {fmt(cert.expiresOn)} · Cargado: {fmt(cert.uploadedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemoveCert}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
            >
              Quitar
            </button>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            Aún no cargaste el certificado.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className={LABEL_CLASS}>Archivo</label>
            <input
              ref={certInputRef}
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Contraseña del certificado</label>
            <input
              type="password"
              value={certPassword}
              onChange={(e) => setCertPassword(e.target.value)}
              autoComplete="off"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Vencimiento (opcional)</label>
            <input type="date" value={certExpires} onChange={(e) => setCertExpires(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveCert}
          disabled={savingCert}
          className="mt-3 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {savingCert ? "Guardando…" : cert ? "Reemplazar certificado" : "Guardar certificado"}
        </button>
      </div>

      {/* Folios CAF */}
      <div className="mt-5 rounded-2xl border border-stone-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Folios CAF (por tipo de documento)</p>
          <button
            type="button"
            onClick={() => cafInputRef.current?.click()}
            disabled={savingCaf}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-orange-200 hover:text-orange-600 disabled:opacity-50"
          >
            {savingCaf ? "Cargando…" : "+ Cargar CAF (.xml)"}
          </button>
          <input ref={cafInputRef} type="file" accept=".xml,text/xml,application/xml" onChange={handleAddCaf} className="hidden" />
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-stone-400 animate-pulse">Cargando…</p>
        ) : (creds?.caf.length ?? 0) === 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            Aún no cargaste folios. Subí el archivo CAF que te entrega el SII por cada tipo de documento.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {creds!.caf.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-semibold text-stone-800">{DTE_LABEL_BY_CODE[c.docType] ?? `Tipo ${c.docType}`}</span>
                  {c.folioDesde != null && c.folioHasta != null ? (
                    <span className="ml-2 text-xs text-stone-500">Folios {c.folioDesde}–{c.folioHasta}</span>
                  ) : null}
                  {c.filename ? <span className="ml-2 text-[11px] text-stone-400">{c.filename}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteCaf(c.id)}
                  className="text-xs font-bold text-stone-400 transition hover:text-red-600"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {feedback && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <p className="mt-4 text-[11px] leading-4 text-stone-400">
        El certificado y los folios se almacenan cifrados (Supabase Vault) y nunca se muestran de vuelta.
        Se usarán para firmar y timbrar los documentos cuando se active la emisión con el proveedor y la
        certificación del SII.
      </p>
    </section>
  )
}
