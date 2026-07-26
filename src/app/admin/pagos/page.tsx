"use client"

import { useEffect, useMemo, useState } from "react"
import {
  getTaxProfile,
  saveTaxProfile,
  type TaxProfile,
} from "@/services/payments-service"
import {
  listTaxDocuments,
  emitDocument,
  getDocumentForView,
  deleteDocument,
  annulDocument,
  getDteProviderInfo,
  type TaxDocument,
} from "@/services/dte-service"
import { DTE_LABEL_BY_CODE } from "@/lib/dte/types"
import { DocumentView, type DocumentViewEmisor } from "@/components/dte/DocumentView"
import { DocumentActions } from "@/components/dte/DocumentActions"
import {
  useSiiActividades,
  useSiiRubros,
  SiiActividadCombobox,
} from "@/components/admin/SiiActividadCombobox"
import { LogoUploader } from "@/components/admin/LogoUploader"
import { DteCredentialsSection } from "@/components/admin/DteCredentialsSection"

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})

const DTE_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  error: "bg-red-50 text-red-700 ring-red-200",
}
const DTE_STATUS_LABEL: Record<string, string> = {
  pending: "En trámite",
  accepted: "Aceptado",
  rejected: "Rechazado",
  error: "Error",
}

const EMPTY_PROFILE: TaxProfile = {
  rut: "",
  razonSocial: "",
  giro: "",
  direccion: "",
  comuna: "",
  actividadEconomica: "",
  regimenIva: "Régimen general",
  logoUrl: "",
}

const REGIMEN_OPTIONS = ["Régimen general", "Pro Pyme", "Otro"] as const

const INPUT_CLASS =
  "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"

const LABEL_CLASS =
  "mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500"

function TaxProfileSection() {
  const [profile, setProfile] = useState<TaxProfile>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)
  const { items: actividades, loading: catLoading } = useSiiActividades()
  const { items: rubros } = useSiiRubros()

  // Letra de sección (rubro) del giro elegido, para filtrar las actividades.
  const selectedRubroCodigo = useMemo(
    () => rubros.find((r) => r.nombre === profile.giro)?.codigo,
    [rubros, profile.giro]
  )

  // Si hay un rubro seleccionado, la actividad económica se acota a ese rubro.
  const actividadesFiltradas = useMemo(
    () =>
      selectedRubroCodigo
        ? actividades.filter((a) => a.rubro === selectedRubroCodigo)
        : actividades,
    [actividades, selectedRubroCodigo]
  )

  // Al cambiar el rubro, si la actividad elegida no pertenece al nuevo rubro,
  // se limpia para forzar una selección coherente.
  function changeGiro(nombre: string) {
    const nuevoRubro = rubros.find((r) => r.nombre === nombre)?.codigo
    const codigoActual = profile.actividadEconomica.split(" - ")[0]?.trim()
    const actActual = actividades.find((a) => a.codigo === codigoActual)
    setProfile((prev) => ({
      ...prev,
      giro: nombre,
      actividadEconomica:
        nuevoRubro && actActual && actActual.rubro !== nuevoRubro
          ? ""
          : prev.actividadEconomica,
    }))
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const result = await getTaxProfile()
      if (!active) return
      if (result.ok) {
        setProfile({
          ...result.data,
          regimenIva: result.data.regimenIva || "Régimen general",
        })
      } else {
        setFeedback({ kind: "error", message: result.error })
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  function update<K extends keyof TaxProfile>(key: K, value: TaxProfile[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await saveTaxProfile(profile)
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      setFeedback({ kind: "ok", message: "Guardado" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Datos tributarios</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        Estos datos se usarán para emitir boletas y facturas a nombre del restaurante.
      </p>

      {loading ? (
        <p className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm font-semibold text-stone-500 animate-pulse">
          Cargando datos...
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>RUT</label>
              <input
                type="text"
                value={profile.rut}
                onChange={(e) => update("rut", e.target.value)}
                maxLength={20}
                placeholder="76.123.456-7"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Razón social</label>
              <input
                type="text"
                value={profile.razonSocial}
                onChange={(e) => update("razonSocial", e.target.value)}
                maxLength={120}
                placeholder="Mi Restaurante SpA"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Giro (rubro SII)</label>
              <select
                value={profile.giro}
                onChange={(e) => changeGiro(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Seleccioná un rubro…</option>
                {profile.giro && !rubros.some((r) => r.nombre === profile.giro) ? (
                  <option value={profile.giro}>{profile.giro}</option>
                ) : null}
                {rubros.map((r) => (
                  <option key={r.codigo} value={r.nombre}>
                    {r.codigo} — {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>Actividad económica</label>
              <SiiActividadCombobox
                items={actividadesFiltradas}
                loading={catLoading}
                disabled={!profile.giro.trim()}
                value={profile.actividadEconomica}
                placeholder={
                  !profile.giro.trim()
                    ? "Seleccioná primero un giro"
                    : "Buscá dentro del rubro elegido"
                }
                onSelect={(it) => {
                  update("actividadEconomica", `${it.codigo} - ${it.glosa}`)
                }}
              />
              <p className="mt-1.5 text-[11px] font-medium text-stone-400">
                {!profile.giro.trim()
                  ? "Elegí un giro para habilitar la búsqueda de actividades."
                  : "Mostrando solo actividades del rubro seleccionado."}
              </p>
            </div>

            <div>
              <label className={LABEL_CLASS}>Dirección</label>
              <input
                type="text"
                value={profile.direccion}
                onChange={(e) => update("direccion", e.target.value)}
                maxLength={160}
                placeholder="Av. Siempre Viva 123"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Comuna</label>
              <input
                type="text"
                value={profile.comuna}
                onChange={(e) => update("comuna", e.target.value)}
                maxLength={80}
                placeholder="Providencia"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Régimen IVA</label>
              <select
                value={profile.regimenIva}
                onChange={(e) => update("regimenIva", e.target.value)}
                className={INPUT_CLASS}
              >
                {REGIMEN_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 border-t border-stone-100 pt-6">
            <label className={LABEL_CLASS}>Logo del restaurante</label>
            <p className="mb-3 text-[11px] text-stone-500">
              Se aplica a las boletas y facturas que emitas.
            </p>
            <LogoUploader
              value={profile.logoUrl || null}
              onChange={(url) => update("logoUrl", url ?? "")}
              disabled={saving}
            />
          </div>

          {feedback && (
            <p
              className={`mt-5 rounded-lg px-3 py-2 text-xs font-medium ${
                feedback.kind === "ok"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {feedback.message}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function TaxDocumentsSection() {
  const [docs, setDocs] = useState<TaxDocument[]>([])
  const [loading, setLoading] = useState(true)
  // true = adaptador simulado (rótulos de prueba); false = proveedor real.
  const [dteSimulated, setDteSimulated] = useState(true)
  const [amount, setAmount] = useState("10000")
  const [emitting, setEmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)
  const [preview, setPreview] = useState<{ doc: TaxDocument; emisor: DocumentViewEmisor } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [docType, setDocType] = useState<"boleta" | "factura">("boleta")
  const [receptorRut, setReceptorRut] = useState("")
  const [receptorRazon, setReceptorRazon] = useState("")
  const [receptorGiro, setReceptorGiro] = useState("")
  const [receptorDir, setReceptorDir] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [annulId, setAnnulId] = useState<number | null>(null)
  const [annulReason, setAnnulReason] = useState("")
  const [annulling, setAnnulling] = useState(false)

  async function confirmAnnul() {
    if (annulId == null || annulling) return
    if (!annulReason.trim()) {
      setFeedback({ kind: "error", message: "Indicá el motivo de la anulación." })
      return
    }
    setAnnulling(true)
    const result = await annulDocument(annulId, annulReason.trim())
    setAnnulling(false)
    if (!result.ok) {
      setFeedback({ kind: "error", message: result.error })
      return
    }
    setFeedback({ kind: "ok", message: "Factura anulada. Se generó la nota de crédito." })
    setAnnulId(null)
    setAnnulReason("")
    await load()
  }

  async function removeDoc(id: number) {
    setDeletingId(id)
    const result = await deleteDocument(id)
    setDeletingId(null)
    setConfirmDeleteId(null)
    if (!result.ok) {
      setFeedback({ kind: "error", message: result.error })
      return
    }
    await load()
  }

  async function openPreview(id: number) {
    setPreviewLoading(true)
    const result = await getDocumentForView(id)
    setPreviewLoading(false)
    if (result.ok) setPreview(result.data)
    else setFeedback({ kind: "error", message: result.error })
  }

  async function load() {
    const result = await listTaxDocuments()
    if (result.ok) setDocs(result.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    getDteProviderInfo().then((res) => {
      if (res.ok) setDteSimulated(res.data.simulated)
    })
  }, [])

  async function emitTest() {
    if (emitting) return
    const total = parseInt(amount.replace(/[^\d]/g, ""), 10)
    if (!Number.isFinite(total) || total <= 0) {
      setFeedback({ kind: "error", message: "Ingresá un monto válido." })
      return
    }
    // La factura exige identificar al receptor; la boleta no.
    if (docType === "factura" && (!receptorRut.trim() || !receptorRazon.trim())) {
      setFeedback({ kind: "error", message: "Para una factura, indicá el RUT y la razón social del receptor." })
      return
    }
    setEmitting(true)
    setFeedback(null)
    try {
      const result = await emitDocument({
        type: docType,
        total,
        receptor:
          docType === "factura"
            ? {
                rut: receptorRut.trim(),
                razonSocial: receptorRazon.trim(),
                giro: receptorGiro.trim() || undefined,
                direccion: receptorDir.trim() || undefined,
              }
            : undefined,
      })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      const label = docType === "factura" ? "Factura" : "Boleta"
      setFeedback({
        kind: "ok",
        message: dteSimulated
          ? `${label} emitida (folio ${result.data.folio}).`
          : `${label} emitida${result.data.folio != null ? ` (folio ${result.data.folio})` : ""} — estado SII: ${result.data.status === "accepted" ? "aceptada" : "en trámite"}.`,
      })
      await load()
    } finally {
      setEmitting(false)
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-stone-900">Documentos tributarios</h3>
      <p className="mt-1 text-xs font-medium text-stone-500">
        {dteSimulated
          ? "Historial de comprobantes emitidos. Todavía no tienen validez tributaria ante el SII — se activa al certificar el proveedor de facturación electrónica."
          : "Historial de boletas y facturas emitidas por el proveedor conectado."}
      </p>

      {/* Panel de emisión manual */}
      <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-stone-600">
          Emisión manual
        </p>
        <p className="mt-1 text-xs text-stone-500">
          {dteSimulated
            ? "Emite un comprobante de venta fuera del flujo de cobro (p. ej. una venta por encargo)."
            : "Emite una boleta o factura fuera del flujo de cobro (p. ej. una venta por encargo)."}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className={LABEL_CLASS}>Tipo</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as "boleta" | "factura")}
              className={INPUT_CLASS + " w-44"}
            >
              <option value="boleta">Boleta electrónica</option>
              <option value="factura">Factura electrónica</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Monto total (CLP)</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={INPUT_CLASS + " w-40"}
            />
          </div>
        </div>

        {docType === "factura" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>RUT del receptor</label>
              <input
                type="text"
                value={receptorRut}
                onChange={(e) => setReceptorRut(e.target.value)}
                placeholder="76.543.210-K"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Razón social del receptor</label>
              <input
                type="text"
                value={receptorRazon}
                onChange={(e) => setReceptorRazon(e.target.value)}
                placeholder="Cliente Empresa SpA"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Giro del receptor</label>
              <input
                type="text"
                value={receptorGiro}
                onChange={(e) => setReceptorGiro(e.target.value)}
                placeholder="Comercio / Servicios"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Dirección del receptor</label>
              <input
                type="text"
                value={receptorDir}
                onChange={(e) => setReceptorDir(e.target.value)}
                placeholder="Calle 123, Comuna"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-3">
          <button
            type="button"
            onClick={emitTest}
            disabled={emitting}
            className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-stone-700 disabled:opacity-50"
          >
            {emitting ? "Emitiendo…" : `Emitir ${docType === "factura" ? "factura" : "boleta"}`}
          </button>
        </div>
        {feedback && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
              feedback.kind === "ok"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
              <th className="py-2 pr-4">Documento</th>
              <th className="py-2 pr-4">Folio</th>
              <th className="py-2 pr-4 text-right">Total</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Emitido</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm font-semibold text-stone-500 animate-pulse">
                  Cargando…
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-stone-500">
                  Aún no hay documentos emitidos.
                </td>
              </tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id} className="border-b border-stone-50 last:border-b-0">
                  <td className="py-2.5 pr-4">
                    <span className="font-semibold text-stone-900">
                      {DTE_LABEL_BY_CODE[d.docType] ?? `Tipo ${d.docType}`}
                    </span>
                    {d.voided ? (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                        Anulada
                      </span>
                    ) : null}
                    {d.docType === 61 && d.refFolio ? (
                      <p className="mt-0.5 text-[11px] text-stone-400">Anula factura N° {d.refFolio}</p>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-stone-700">{d.folio ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-stone-900">
                    {d.total != null ? clp.format(d.total) : "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${DTE_STATUS_BADGE[d.siiStatus] ?? "bg-stone-100 text-stone-600 ring-stone-200"}`}>
                      {DTE_STATUS_LABEL[d.siiStatus] ?? d.siiStatus}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-stone-500">
                    {d.emittedAt ? new Date(d.emittedAt).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    {confirmDeleteId === d.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeDoc(d.id)}
                          disabled={deletingId === d.id}
                          className="text-xs font-bold text-red-600 transition hover:underline disabled:opacity-50"
                        >
                          {deletingId === d.id ? "Borrando…" : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs font-semibold text-stone-500 transition hover:underline"
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openPreview(d.id)}
                          disabled={previewLoading}
                          className="text-xs font-bold text-orange-600 transition hover:underline disabled:opacity-50"
                        >
                          Ver
                        </button>
                        {(d.docType === 33 || d.docType === 34) && !d.voided && d.siiStatus === "accepted" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAnnulId(d.id)
                              setAnnulReason("")
                            }}
                            className="text-xs font-bold text-stone-400 transition hover:text-red-600"
                          >
                            Anular
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(d.id)}
                          className="text-xs font-bold text-stone-400 transition hover:text-red-600"
                        >
                          Borrar
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Anular factura -> generar nota de crédito */}
      {annulId != null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4"
          onClick={() => (annulling ? null : setAnnulId(null))}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-stone-900">Anular factura</h3>
            <p className="mt-1 text-sm text-stone-500">
              Se generará automáticamente una <strong>nota de crédito</strong> que anula esta
              factura (referenciándola). Indicá el motivo.
            </p>
            <textarea
              value={annulReason}
              onChange={(e) => setAnnulReason(e.target.value)}
              rows={3}
              placeholder="Ej: Anulación por error en la emisión / devolución"
              className={INPUT_CLASS + " mt-4"}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAnnulId(null)}
                disabled={annulling}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAnnul}
                disabled={annulling}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {annulling ? "Generando…" : "Anular y generar nota de crédito"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Vista previa del documento en modal (render directo, sin iframe) */}
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/60 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-2.5 print:hidden">
              <p className="text-sm font-bold text-stone-900">Vista previa del documento</p>
              <div className="flex items-center gap-3">
                <a
                  href={`/documento/${preview.doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-orange-600 hover:underline"
                >
                  Abrir en pestaña ↗
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-lg px-2 py-1 text-sm font-bold text-stone-500 hover:bg-stone-100"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <DocumentView doc={preview.doc} emisor={preview.emisor} />
              <div className="print:hidden">
                <DocumentActions
                  doc={preview.doc}
                  emisor={{ rut: preview.emisor.rut, razonSocial: preview.emisor.razonSocial }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default function PagosPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">
          Pagos y facturación
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Carga los datos tributarios de tu restaurante y revisa las boletas y facturas emitidas.
          La conexión de tu pasarela de pago vive en Ajustes.
        </p>
      </section>

      <TaxProfileSection />
      <DteCredentialsSection />
      <TaxDocumentsSection />
    </div>
  )
}
