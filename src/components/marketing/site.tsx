"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const ORANGE = "#F5871F"

/* ---------- Marca (cloche + QR) ---------- */
export function Mark({ stroke = "#fff" }: { stroke?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g stroke={stroke} strokeWidth="6" strokeLinecap="square"><path d="M22 14H14V22M78 14h8v8M22 86H14v-8M78 86h8v-8" /></g>
      <path d="M30 64h40l-3 5H33z" fill={ORANGE} />
      <path d="M46 69h8v9h10v4H36v-4h10z" fill={ORANGE} />
      <path d="M28 60a22 22 0 0 1 44 0z" fill={ORANGE} />
      <circle cx="50" cy="34" r="4" fill={ORANGE} />
      <path d="M40 56c0-9 4-15 9-18" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const PATHS: Record<string, string> = {
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v9"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="M12 2l3 6.5 7 .8-5 4.8 1.3 7L12 17.8 5.4 21l1.3-7-5-4.8 7-.8z"/>',
  trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8a2 2 0 0 0-3 0z"/><path d="M12 15l-3-3a22 22 0 0 1 8-10c2.4 0 4 .3 5 1 .7 1 1 2.6 1 5a22 22 0 0 1-10 8z"/><path d="M9 12H4s.5-2.8 2-4 5 0 5 0M12 15v5s2.8-.5 4-2 0-5 0-5"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  tag: '<path d="M20.6 13.4 12 22 2 12V3h9l9.6 9.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  coffee: '<path d="M18 8h1a3 3 0 0 1 0 6h-1"/><path d="M3 8h15v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  wine: '<path d="M8 22h8M12 15v7M6 3h12l-1 6a5 5 0 0 1-10 0z"/>',
  burger: '<path d="M3 11h18a8 8 0 0 0-18 0z"/><path d="M3 16h18M5 16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/><path d="M3 13h18"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
  scale: '<path d="M12 3v18M5 21h14M6 8h12"/><path d="M6 8l-3 6a3 3 0 0 0 6 0z"/><path d="M18 8l-3 6a3 3 0 0 0 6 0z"/>',
  boxes: '<path d="M3 8l4-2 4 2v4l-4 2-4-2z"/><path d="M13 8l4-2 4 2v4l-4 2-4-2z"/><path d="M8 16l4-2 4 2v4l-4 2-4-2z"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17v.5"/>',
}
export function Ico({ n }: { n: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: PATHS[n] ?? "" }} />
}
function ArrowSvg() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}
export function CornerArrow() {
  return <span className="corner"><svg viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M17 7H9M17 7v8" /></svg></span>
}
export function Tick() {
  return <span className="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg></span>
}

export function Btn({ label, variant = "orange", href, block }: { label: string; variant?: "orange" | "dark" | "ghost"; href: string; block?: boolean }) {
  const cls = `btn btn-${variant}${block ? " btn-block" : ""}`
  const inner = (<><span>{label}</span><span className="ico"><ArrowSvg /></span></>)
  if (href.startsWith("/")) return <Link className={cls} href={href}>{inner}</Link>
  return <a className={cls} href={href}>{inner}</a>
}

/* Fondo del hero: degradado naranja nítido + grilla de puntos (igual al
   fallback del original). Sin shader WebGL: el codegen de three genera
   identificadores GLSL con doble guión bajo que el driver del navegador
   rechaza, así que no compila en todas las GPU. */
export function HeroFx() {
  return (
    <div className="hero-fx" aria-hidden>
      <div className="dots" />
    </div>
  )
}

export function Eyebrow({ num, tag }: { num: string; tag: string }) {
  return <div className="eyebrow reveal"><span className="num">{num}</span><span className="tag">{tag}</span></div>
}

export function Feature({ title, text }: { title: string; text: string }) {
  return <li><Tick /><div><strong>{title}</strong><p>{text}</p></div></li>
}

/* ---------- Page header (interior) ---------- */
export function Phead({ tag, title, lead }: { tag: string; title: string; lead: string }) {
  return (
    <header className="phead">
      <div className="halo" />
      <div className="wrap">
        <div className="eyebrow reveal"><span className="num">·</span><span className="tag">{tag}</span></div>
        <h1 className="reveal">{title}</h1>
        <p className="lead reveal">{lead}</p>
        <div className="cta-row mt-m reveal"><Btn label="Solicita una demo" href="/demo" /></div>
      </div>
    </header>
  )
}

export function CtaBand({ title, lead, secondary }: { title: string; lead: string; secondary?: { label: string; href: string } }) {
  return (
    <section className="section bg-white" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="cta-band reveal">
          <div className="halo" />
          <h2>{title}</h2>
          <p className="lead">{lead}</p>
          <div className="row">
            <Btn label="Solicita una demo" href="/demo" />
            {secondary ? <a className="btn btn-ghost" href={secondary.href}>{secondary.label} →</a> : null}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Mockups ---------- */
export function Mock({ label, light }: { label: string; light?: boolean }) {
  const bracket = light ? "#111827" : "#ffffff"
  return (
    <div className={`mock${light ? " light" : ""}`}>
      <div className="dome">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g stroke={bracket} strokeWidth="6" strokeLinecap="square"><path d="M22 14H14V22M78 14h8v8M22 86H14v-8M78 86h8v-8" /></g>
          <path d="M30 64h40l-3 5H33z" fill={bracket} />
          <path d="M46 69h8v9h10v4H36v-4h10z" fill={bracket} />
          <path d="M28 60a22 22 0 0 1 44 0z" fill={bracket} />
          <circle cx="50" cy="34" r="4" fill={bracket} />
        </svg>
      </div>
      <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
      <span className="lab">{label}</span>
    </div>
  )
}

function Corners() {
  return <><span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" /></>
}

export function DashShot() {
  const li = (tag: string, green: boolean, mesa: string, items: string, total: string) => (
    <div className="d-li"><span className={`tg${green ? " g" : ""}`}>{tag}</span><small>{mesa} · {items}</small><b>{total}</b></div>
  )
  return (
    <div className="shot"><Corners />
      <div className="dash">
        <div className="d-top"><span className="dot o" /><span className="dot" /><span className="dot" /><b>Panel MESA · hoy</b></div>
        <div className="d-row">
          <div className="d-kpi"><span>Pedidos</span><b>48</b></div>
          <div className="d-kpi"><span>Ticket prom.</span><b>$14<em>.2k</em></b></div>
          <div className="d-kpi"><span>Mesas activas</span><b>9</b></div>
        </div>
        <div className="d-list">
          {li("En cocina", false, "Mesa 7", "2 ítems", "$15.400")}
          {li("Entregado", true, "Mesa 3", "4 ítems", "$28.900")}
          {li("En cocina", false, "Mesa 12", "1 ítem", "$6.500")}
          {li("Entregado", true, "Barra 2", "3 ítems", "$19.700")}
        </div>
      </div>
    </div>
  )
}

export function PhoneShot() {
  const item = (name: string, desc: string, price: string) => (
    <div className="item"><span className="th" /><span className="meta"><b>{name}</b><span>{desc}</span></span><span className="pr">{price}</span></div>
  )
  return (
    <div className="shot"><Corners />
      <div className="phone"><div className="nub" /><div className="scr">
        <div className="ph-top" style={{ paddingTop: 6 }}><span className="pm"><Ico n="qr" /></span><b>Mesa 7</b><span>Menú</span></div>
        <div className="cats"><i className="on">Entradas</i><i>Fondos</i><i>Postres</i><i>Bebidas</i></div>
        {item("Ceviche del día", "Pesca fresca, cítricos", "$8.900")}
        {item("Empanadas (3)", "Pino, queso o camarón", "$6.500")}
        {item("Tabla para compartir", "Quesos y embutidos", "$12.900")}
        {item("Ensalada de la casa", "Mix verde, palta", "$5.900")}
        <div className="ph-btn">Realizar pedido · 2 ítems</div>
      </div></div>
    </div>
  )
}

export function RecipeShot() {
  const row = (name: string, qty: string, cost: string) => (
    <div className="rc-li"><span className="rc-dot" /><small>{name}</small><span className="rc-q">{qty}</span><b>{cost}</b></div>
  )
  return (
    <div className="shot"><Corners />
      <div className="recipe">
        <div className="rc-top"><span className="rc-pm"><Ico n="scale" /></span><b>Lomo a lo pobre</b><span className="rc-tag">Receta</span></div>
        <div className="rc-list">
          {row("Lomo de res 220g", "220 g", "$2.640")}
          {row("Papas fritas", "180 g", "$540")}
          {row("Huevo (2)", "2 un", "$420")}
          {row("Cebolla caram.", "60 g", "$180")}
        </div>
        <div className="rc-foot">
          <div className="rc-kpi"><span>Costo</span><b>$3.780</b></div>
          <div className="rc-kpi"><span>Precio</span><b>$9.900</b></div>
          <div className="rc-kpi hl"><span>Margen</span><b>62%</b></div>
        </div>
      </div>
    </div>
  )
}

function ApiLine({ children }: { children: React.ReactNode }) {
  return <div className="api-ln">{children}</div>
}

function ApiString({ t }: { t: string }) {
  return <span className="s">{t}</span>
}

function ApiNumber({ t }: { t: string }) {
  return <span className="n">{t}</span>
}

export function ApiShot() {
  return (
    <div className="shot"><Corners />
      <div className="api">
        <div className="api-top"><span className="api-dot o" /><span className="api-dot" /><span className="api-dot" /><b>GET /v1/inventory</b></div>
        <div className="api-body">
          <ApiLine>{"{"}</ApiLine>
          <ApiLine>&nbsp;&nbsp;<ApiString t={'"product"'} />: <ApiString t={'"Ceviche del día"'} />,</ApiLine>
          <ApiLine>&nbsp;&nbsp;<ApiString t={'"sku"'} />: <ApiString t={'"CEV-01"'} />,</ApiLine>
          <ApiLine>&nbsp;&nbsp;<ApiString t={'"stock"'} />: <ApiNumber t="38" />,</ApiLine>
          <ApiLine>&nbsp;&nbsp;<ApiString t={'"min"'} />: <ApiNumber t="10" />,</ApiLine>
          <ApiLine>&nbsp;&nbsp;<ApiString t={'"status"'} />: <ApiString t={'"ok"'} />,</ApiLine>
          <ApiLine>&nbsp;&nbsp;<ApiString t={'"updated"'} />: <ApiString t={'"live"'} /></ApiLine>
          <ApiLine>{"}"}</ApiLine>
        </div>
      </div>
    </div>
  )
}

export function Counter({ to, prefix = "", suffix = "", decimals = 0 }: { to: number; prefix?: string; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.setTimeout(() => setVal(to), 0)
      return () => window.clearTimeout(id)
    }
    let raf = 0
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return
      io.unobserve(e.target)
      const dur = 1200, start = performance.now()
      const frame = (now: number) => {
        const p = Math.min((now - start) / dur, 1)
        setVal(to * (1 - Math.pow(1 - p, 3)))
        if (p < 1) raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    }), { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [to])
  return <span ref={ref}>{prefix}{decimals > 0 ? val.toFixed(decimals) : Math.round(val)}{suffix}</span>
}

/* ---------- Nav data ---------- */
const PRODUCTS: [string, string, string][] = [
  ["/menu-qr", "Menú QR digital", "Tus clientes piden desde su celular"],
  ["/pedidos", "Pedidos en tiempo real", "Cada orden llega al instante a tu equipo"],
  ["/cocina", "Comandas en cocina", "Los pedidos llegan a quien prepara"],
  ["/mesas-qr", "Mesas y QR", "Un código único por mesa"],
  ["/stock", "Control de stock", "Inventario que se actualiza solo"],
  ["/reportes", "Reportes estratégicos", "Tu negocio en números claros"],
  ["/gestion", "Gestión e inventario", "Stock, recetas, reportes y API"],
  ["/panel", "Panel administrativo", "Controla toda tu operación en un lugar"],
]
const SOLUTIONS: [string, string, string][] = [
  ["/soluciones-restaurantes", "Restaurantes", "Más rotación, menos errores"],
  ["/soluciones-cafeterias", "Cafeterías y panaderías", "Atención ágil en barra"],
  ["/soluciones-bares", "Bares y cervecerías", "Pedidos y cuentas grupales"],
  ["/soluciones-comida-rapida", "Comida rápida", "Cada segundo cuenta"],
]
const Chevron = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>

/* ---------- Shell (nav + footer + mobile + clock + reveal) ---------- */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mOpen, setMOpen] = useState(false)
  const [clock, setClock] = useState("--:--")

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false }))
    tick(); const id = setInterval(tick, 20000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => setMOpen(false), 0)
    return () => window.clearTimeout(id)
  }, [pathname])

  useEffect(() => {
    const els = document.querySelectorAll(".mesa-site .reveal:not(.in)")
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target) }
    }), { threshold: 0.12 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [pathname])

  return (
    <div className="mesa-site">
      <div className="nav-shell">
        <div className="nav">
          <div className="nav-left">
            <Link className="brand" href="/"><span className="mark"><Mark /></span><span className="name">MESA</span></Link>
            <nav className="nav-links">
              <div className="has-drop">
                <span className="drop-trigger" tabIndex={0}>Producto <Chevron /></span>
                <div className="drop cols"><div className="drop-inner">
                  {PRODUCTS.map(([h, t, d]) => <Link key={h} href={h}><strong>{t}</strong><span>{d}</span></Link>)}
                </div></div>
              </div>
              <div className="has-drop">
                <span className="drop-trigger" tabIndex={0}>Soluciones <Chevron /></span>
                <div className="drop"><div className="drop-inner">
                  {SOLUTIONS.map(([h, t, d]) => <Link key={h} href={h}><strong>{t}</strong><span>{d}</span></Link>)}
                </div></div>
              </div>
              <Link className={pathname === "/como-funciona" ? "active" : ""} href="/como-funciona">Cómo funciona</Link>
              <Link className={pathname === "/integraciones" ? "active" : ""} href="/integraciones">Integraciones</Link>
              <Link className={pathname === "/precios" ? "active" : ""} href="/precios">Precios</Link>
            </nav>
          </div>
          <div className="nav-right">
            <span className="live"><span className="dot"><span className="ping" /><span /></span><span>{clock}</span> en vivo</span>
            <Btn label="Solicita una demo" variant="dark" href="/demo" />
          </div>
          <button className="nav-toggle" onClick={() => setMOpen(true)}>Menú <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
        </div>
      </div>

      <div className={`m-menu${mOpen ? " open" : ""}`}>
        <div className="scrim" onClick={() => setMOpen(false)} />
        <div className="m-sheet">
          <div className="m-top">
            <span className="live"><span className="dot"><span /></span><span>{clock}</span> en vivo</span>
            <button className="m-close" onClick={() => setMOpen(false)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          <nav className="m-nav">
            <Link href="/">Inicio</Link>
            <Link href="/menu-qr">Producto</Link>
            <Link href="/soluciones-restaurantes">Soluciones</Link>
            <Link href="/como-funciona">Cómo funciona</Link>
            <Link href="/precios">Precios</Link>
          </nav>
          <Btn label="Solicita una demo" href="/demo" block />
        </div>
      </div>

      {children}

      <footer className="footer">
        <div className="wrap">
          <div className="foot-top">
            <div className="foot-brand">
              <Link className="brand" href="/"><span className="mark"><Mark /></span><span className="name">MESA</span></Link>
              <p>Digitaliza la experiencia de tu restaurante: menús QR, pedidos en tiempo real y administración inteligente. Sin descargar apps.</p>
            </div>
            <div className="foot-col"><h5>Producto</h5>{PRODUCTS.map(([h, t]) => <Link key={h} href={h}>{t}</Link>)}</div>
            <div className="foot-col"><h5>Soluciones</h5>{SOLUTIONS.map(([h, t]) => <Link key={h} href={h}>{t}</Link>)}</div>
            <div className="foot-col"><h5>Empresa</h5>
              <Link href="/como-funciona">Cómo funciona</Link>
              <Link href="/integraciones">Integraciones</Link>
              <Link href="/precios">Precios</Link>
              <Link href="/demo">Solicita una demo</Link>
              <Link href="/login">Iniciar sesión</Link>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© {new Date().getFullYear()} MESA · Santiago, Chile · Hecho para la gastronomía moderna.</span>
            <span className="foot-social">
              <a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 01-1.38-.9 3.7 3.7 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 8.18a3.42 3.42 0 100 6.84 3.42 3.42 0 000-6.84zm6.9-2.21a1.27 1.27 0 11-2.54 0 1.27 1.27 0 012.54 0z" /></svg></a>
              <a href="#" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 8.98h4v12H3v-12zM9.5 8.98H13.3v1.64h.05c.53-1 1.82-2.06 3.75-2.06C21 8.56 22 11.2 22 14.62v6.36h-4v-5.64c0-1.34-.02-3.07-1.87-3.07-1.87 0-2.16 1.46-2.16 2.97v5.74h-4v-12z" /></svg></a>
              <a href="#" aria-label="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.78 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.84 14.06c-.25.7-1.45 1.34-2 1.42-.53.08-1.18.11-1.9-.12-.44-.14-1-.33-1.73-.64-3.04-1.31-5.02-4.37-5.17-4.57-.15-.2-1.24-1.65-1.24-3.15s.79-2.24 1.07-2.55c.28-.31.61-.39.81-.39l.58.01c.19 0 .44-.07.68.52.25.6.84 2.07.91 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.12.63-.07.17-.2.73-.85.92-1.14.19-.29.39-.24.65-.15.26.1 1.66.78 1.95.92.29.15.48.22.55.34.07.12.07.7-.18 1.4z" /></svg></a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
