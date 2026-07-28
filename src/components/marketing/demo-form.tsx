"use client"

import { useState } from "react"
import { submitLead } from "@/app/actions/lead-actions"

export function DemoForm({ plan }: { plan?: string }) {
  const [nombre, setNombre] = useState("")
  const [local, setLocal] = useState("")
  const [email, setEmail] = useState("")
  const [telefono, setTelefono] = useState("")
  const [negocio, setNegocio] = useState("")
  const [ciudad, setCiudad] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const errStyle = (bad: boolean) => (touched && bad ? { borderColor: "var(--orange)" } : undefined)

  async function submit() {
    setTouched(true)
    if (!nombre.trim() || !local.trim() || !emailOk || loading) return
    setLoading(true)
    setError("")
    try {
      const res = await submitLead({
        nombre: nombre.trim(),
        local: local.trim(),
        contacto: email.trim(),
        telefono: telefono.trim() || undefined,
        negocio: negocio || undefined,
        ciudad: ciudad.trim() || undefined,
        mensaje: mensaje.trim() || undefined,
        plan: plan || undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="form">
      {plan ? <p className="form-note" style={{ marginBottom: 14, marginTop: 0 }}>Plan de interés: <strong style={{ color: "var(--ink)" }}>{plan}</strong></p> : null}
      <div className="form-row">
        <div className="field"><label>Nombre</label><input type="text" placeholder="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} style={errStyle(!nombre.trim())} /></div>
        <div className="field"><label>Nombre del local</label><input type="text" placeholder="Tu restaurante o café" value={local} onChange={(e) => setLocal(e.target.value)} style={errStyle(!local.trim())} /></div>
      </div>
      <div className="form-row">
        <div className="field"><label>Correo</label><input type="email" placeholder="tucorreo@ejemplo.cl" value={email} onChange={(e) => setEmail(e.target.value)} style={errStyle(!emailOk)} /></div>
        <div className="field"><label>Teléfono / WhatsApp</label><input type="tel" placeholder="+56 9 ..." value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="field"><label>Tipo de negocio</label>
          <select value={negocio} onChange={(e) => setNegocio(e.target.value)}><option value="">Selecciona…</option><option>Restaurante</option><option>Cafetería / Panadería</option><option>Bar / Cervecería</option><option>Comida rápida</option><option>Cadena / Franquicia</option><option>Otro</option></select>
        </div>
        <div className="field"><label>Ciudad</label><input type="text" placeholder="Santiago, Concepción…" value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></div>
      </div>
      <div className="field"><label>¿Algo que debamos saber? (opcional)</label><textarea placeholder="Cuántas mesas tienes, qué buscas resolver…" value={mensaje} onChange={(e) => setMensaje(e.target.value)} /></div>
      <button className="btn btn-orange btn-block" type="button" onClick={submit} disabled={loading || sent} style={sent ? { background: "var(--orange-dk)" } : undefined}>
        <span>{sent ? "Solicitud enviada" : loading ? "Enviando…" : "Enviar solicitud"}</span>
        <span className="ico">
          {sent ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          )}
        </span>
      </button>
      {error ? <p className="form-note" style={{ color: "var(--orange-dk)" }}>{error}</p> : <p className="form-note">Al enviar aceptas que MESA te contacte para coordinar la demo. No compartimos tus datos.</p>}
      <div className={`form-ok${sent ? " show" : ""}`}>¡Gracias! Recibimos tu solicitud. Te contactaremos dentro de las próximas 24 horas hábiles.</div>
    </div>
  )
}
