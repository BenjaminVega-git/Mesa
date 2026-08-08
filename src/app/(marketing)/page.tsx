import { Btn, Ico, SectionMark, Feature, DashShot, Counter, CtaBand, Marquee, ManuelDemo, TicketRail, TestimonialSpotlight } from "@/components/marketing/site"
import { ManuelAvatar } from "@/components/admin/assistant/ManuelAvatar"

export const metadata = {
  title: "MESA — El sistema operativo para restaurantes y cocinas profesionales",
  description: "MESA digitaliza tu restaurante con menús QR, pedidos en tiempo real y un panel para administrar todo en un solo lugar. Sin descargar apps. Listo en minutos.",
}

const heroStats: { to: number; suffix?: string; decimals?: number; lab: string }[] = [
  { to: 35, suffix: "%", lab: "más eficiencia en el servicio" },
  { to: 90, suffix: "%", decimals: 0, lab: "menos errores de comanda" },
  { to: 4.8, decimals: 1, suffix: "/5", lab: "experiencia del cliente" },
  { to: 100, suffix: "%", lab: "escalable a tu ritmo" },
]

const modules = [
  ["layers", "Categorías", "Organiza tus productos por tipo y sección de forma simple."],
  ["box", "Productos y variantes", "Gestiona precios, imágenes y opciones personalizadas de cada platillo."],
  ["qr", "Mesas QR", "Cada mesa tiene su código único para escanear y pedir."],
  ["bell", "Pedidos", "Seguimiento en tiempo real del estado de cada orden."],
  ["users", "Meseros", "Gestión de usuarios, roles y permisos de tu equipo."],
  ["chart", "Reportes", "Ventas, márgenes y horas peak siempre a la mano."],
]
const steps = [
  ["Escanea el QR", "El cliente escanea el código de su mesa."],
  ["Explora el menú", "Navega categorías, fotos y precios."],
  ["Realiza el pedido", "Selecciona productos y confirma."],
  ["El equipo recibe", "La orden llega al instante a cocina."],
  ["Entregado", "El platillo llega a la mesa correcta."],
]
const metrics: { to?: number; prefix?: string; suffix?: string; decimals?: number; text?: string; lab: string; p: string }[] = [
  { to: 35, suffix: "%", lab: "Más eficiencia en el servicio", p: "Tu equipo atiende más mesas por turno con menos esfuerzo." },
  { to: 90, prefix: "↓", suffix: "%", lab: "Menos errores en pedidos", p: "Los pedidos digitales eliminan las confusiones de la comanda verbal." },
  { to: 40, prefix: "↓", suffix: "%", lab: "Menos tiempo de espera", p: "Del escaneo al pedido en segundos, sin esperar al mesero." },
  { to: 4.8, decimals: 1, suffix: "/5", lab: "Experiencia del cliente", p: "Una interfaz limpia y moderna que mejora la percepción de tu negocio." },
  { text: "1 panel", lab: "Administración centralizada", p: "Categorías, productos, mesas, pedidos y meseros en un solo lugar." },
  { to: 100, suffix: "%", lab: "Escalable a tu ritmo", p: "Desde una cafetería hasta una cadena de restaurantes." },
]
const testimonials = [
  { av: "JM", name: "Javiera M.", place: "Café de barrio · Providencia", text: "Pasamos de comandas en papel a tener todo en pantalla. Los errores prácticamente desaparecieron y los meseros se mueven más rápido." },
  { av: "RC", name: "Rodrigo C.", place: "Parrilla · Concepción", text: "La instalación fue en minutos y sin instalar nada. Mis clientes piden desde el QR y la cocina recibe al toque." },
  { av: "VP", name: "Valentina P.", place: "Restaurante · Viña del Mar", text: "Tener todo el menú actualizado al instante nos cambió la vida. Subir un plato nuevo toma segundos." },
]
const cmpCols = ["MESA", "Menú físico", "Software tradicional"] as const
const cmpRows: [string, boolean, boolean, boolean][] = [
  ["Menú siempre actualizado", true, false, true],
  ["Pide sin descargar apps", true, false, false],
  ["Pedidos en tiempo real a cocina", true, false, true],
  ["Listo en minutos", true, true, false],
  ["Sin contratos largos ni hardware caro", true, true, false],
  ["Interfaz pensada para tu equipo", true, false, false],
]
const faqs = [
  ["¿Es fácil de usar para mi equipo?", "Sí. MESA está diseñado para que cualquier persona del equipo, sin experiencia técnica, pueda operarlo desde el primer día. La interfaz es limpia y directa."],
  ["¿Mis clientes tienen que descargar una app?", "No. Funciona directamente desde el navegador del celular. El cliente escanea el QR de la mesa y ya está viendo tu menú, listo para pedir."],
  ["¿Cuánto demora la implementación?", "Cargamos tu menú y generamos los QR de tus mesas en minutos. La mayoría de los locales quedan operativos el mismo día."],
  ["¿Sirve para cafeterías y bares además de restaurantes?", "Sí. MESA se adapta a restaurantes, cafeterías, panaderías, bares, cervecerías y comida rápida. Cada rubro tiene su mejor configuración."],
  ["¿Puedo actualizar precios y platos cuando quiera?", "Cuando quieras y al instante. Cambias un precio o agregas un plato desde el panel y se refleja de inmediato en todos los menús QR."],
]

export default function Home() {
  return (
    <>
      {/* ---- Bloque de apertura oscuro: hero + stats + video, un solo tramo ---- */}
      <section className="hero-pro">
        <div className="hero-pro-bg" aria-hidden="true">
          <div className="sheen" /><div className="grain" /><div className="fade" />
        </div>
        <div className="hero-pro-grid">
          <div>
            <span className="hp-kicker"><span className="hc-dot" />Sistema operativo para restaurantes</span>
            <h1>El sistema que corre en cada <span className="accent">cocina profesional</span>.</h1>
            <p className="sub">De la mesa a la cocina y de la cocina al reporte: MESA conecta pedidos, inventario y un asistente de IA en un solo panel, en tiempo real — para restaurantes, cafeterías y cadenas que operan en serio.</p>
            <div className="cta-row">
              <Btn label="Solicita una demo" href="/demo" />
              <span className="chip-dark"><strong>Sin apps</strong> · listo en minutos</span>
            </div>
          </div>
          <TicketRail />
        </div>
      </section>

      <section className="stats-strip">
        <div className="wrap">
          <div className="grid">
            {heroStats.map((s) => (
              <div key={s.lab} className="stat-item">
                <div className="sv"><Counter to={s.to} suffix={s.suffix} decimals={s.decimals} /></div>
                <div className="sl">{s.lab}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="video-intro dark-block" aria-labelledby="video-intro-title">
        <div className="wrap">
          <div className="video-intro-copy reveal">
            <p className="kicker muted">MESA en acción</p>
            <h2 id="video-intro-title">Una mejor forma de atender, en menos de un minuto.</h2>
          </div>
          <div className="video-frame reveal">
            <video
              controls
              playsInline
              preload="metadata"
              poster="/videos/presentacion-poster.jpg"
              aria-label="Video de presentación de MESA"
            >
              <source src="/videos/presentacion.mp4" type="video/mp4" />
              Tu navegador no puede reproducir este video.
            </video>
          </div>
        </div>
      </section>

      {/* ---- Bloque claro: la historia del producto ---- */}
      <section className="section bg-white" style={{ paddingBlock: "clamp(40px,6vw,64px)" }}>
        <div className="wrap center">
          <p className="muted reveal" style={{ fontSize: 13.5, marginBottom: 26 }}>Pensado para todo tipo de negocio gastronómico en Chile</p>
          <div className="reveal">
            <Marquee items={["Restaurantes", "Cafeterías", "Bares", "Comida rápida", "Panaderías", "Food trucks"]} />
          </div>
        </div>
      </section>

      <section className="section bg-white" id="solucion">
        <div className="wrap">
          <SectionMark num="01" tag="Conoce MESA" />
          <h2 className="reveal maxw-h2">Una sola plataforma para operar todo tu restaurante.</h2>
          <div className="split mt-l">
            <div className="copy reveal">
              <p className="lead">Tus clientes escanean el QR de su mesa, exploran el menú desde el celular y ordenan en segundos. Cada pedido llega al instante a tu equipo y tú controlas todo desde un solo panel.</p>
              <ul className="feature-list">
                <Feature title="Menú digital interactivo" text="Fotos, precios y variantes siempre actualizados." />
                <Feature title="Pedidos directos a tu equipo" text="Sin malentendidos ni comandas perdidas." />
                <Feature title="Control total en un panel" text="Categorías, productos, mesas, pedidos y meseros." />
              </ul>
              <div className="mt-m"><Btn label="Ver cómo funciona" href="/como-funciona" /></div>
            </div>
            <div className="reveal"><DashShot /></div>
          </div>
        </div>
      </section>

      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="02" tag="Cómo funciona" />
          <h2 className="reveal maxw-h2">Del escaneo a la mesa, en cinco pasos.</h2>
          <div className="rail">
            {steps.map(([t, p], i) => (
              <div key={t} className="rail-step reveal">
                <span className="rn">{i + 1}</span>
                <h4>{t}</h4>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-white" id="modulos">
        <div className="wrap">
          <SectionMark num="03" tag="Módulos principales" />
          <h2 className="reveal maxw-h2">Todo lo que tu local necesita, integrado.</h2>
          <div className="bento mt-l stagger">
            <div className="bento-card big reveal">
              <div className="bc-top"><span className="bc-num">00</span></div>
              <div>
                <h3>Panel de control</h3>
                <p>Toda tu operación —carta, mesas, pedidos y equipo— desde un solo lugar, en tiempo real.</p>
              </div>
            </div>
            {modules.map(([ico, t, p], i) => (
              <div key={t} className="bento-card reveal">
                <div className="bc-top"><div className="c-ico"><Ico n={ico} /></div><span className="bc-num">{String(i + 1).padStart(2, "0")}</span></div>
                <div><h3>{t}</h3><p>{p}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Interludio oscuro: el diferenciador de IA ---- */}
      <section className="section dark-block manuel-section" id="manuel">
        <div className="halo" />
        <div className="wrap">
          <SectionMark num="04" tag="Tu asistente de IA" />
          <div className="manuel-split mt-l">
            <div className="reveal">
              <span className="manuel-badge"><ManuelAvatar size={22} /><span>Se llama Manuel</span></span>
              <h2 style={{ maxWidth: "18ch" }}>La única plataforma con un asistente que <span className="accent">ejecuta</span>, no solo responde.</h2>
              <p className="lead mt-m">Manuel vive dentro de tu panel: le hablas como a un encargado de confianza y él consulta tus datos reales, crea productos y cupones, y te avisa qué necesita atención — todo en segundos, en español chileno.</p>
              <ul className="feature-list manuel-feats">
                <Feature title="Entiende lenguaje natural" text="Sin menús ni formularios: le escribes lo que necesitas." />
                <Feature title="Ejecuta acciones reales" text="Crea categorías, productos, cupones y promociones por ti." />
                <Feature title="Conoce tu negocio" text="Ventas, márgenes, inventario y horas peak, siempre al día." />
              </ul>
            </div>
            <div className="reveal"><ManuelDemo /></div>
          </div>
        </div>
      </section>

      {/* ---- Bloque claro: prueba social y decisión ---- */}
      <section className="section bg-white" id="beneficios">
        <div className="wrap">
          <SectionMark num="05" tag="Beneficios para tu negocio" />
          <h2 className="reveal" style={{ maxWidth: "16ch" }}>Resultados que <span className="accent">se notan</span> desde el primer servicio.</h2>
          <div className="grid g-3 mt-l stagger">
            {metrics.map((m, i) => (
              <div key={m.lab} className="spec-card reveal">
                <span className="sc-tag">{String(i + 1).padStart(2, "0")}</span>
                <div className="val">{m.text ? m.text : <Counter to={m.to ?? 0} prefix={m.prefix} suffix={m.suffix} decimals={m.decimals} />}</div>
                <div className="lab">{m.lab}</div>
                <p>{m.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section dark-block">
        <div className="wrap">
          <SectionMark num="06" tag="Testimonios" />
          <h2 className="reveal center maxw mx-auto" style={{ marginBottom: 8 }}>A los equipos les encanta trabajar con MESA.</h2>
          <div className="mt-l reveal">
            <TestimonialSpotlight items={testimonials} />
          </div>
        </div>
      </section>

      <section className="section bg-white">
        <div className="wrap">
          <SectionMark num="07" tag="Por qué MESA" />
          <h2 className="reveal maxw-h2">Lo esencial, sin la complejidad de siempre.</h2>
          <div className="cmp-cards reveal">
            {cmpCols.map((col, ci) => (
              <div key={col} className={`cmp-card${ci === 0 ? " featured" : ""}`}>
                <div className={`cc-head${ci === 0 ? " on" : ""}`}>{ci === 0 ? "Recomendado" : "Alternativa"}</div>
                <h4>{col}</h4>
                <ul>
                  {cmpRows.map((r) => {
                    const ok = r[ci + 1] as boolean
                    return (
                      <li key={r[0]} className={ok ? "yes" : "no"}>
                        <span className="m">{ok ? "✓" : "✕"}</span>
                        <span>{r[0]}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="08" tag="Preguntas frecuentes" />
          <h2 className="reveal maxw-h2">Resolvemos tus dudas antes de empezar.</h2>
          <div className="faq-v2 reveal">
            {faqs.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>
                  <span className="fq-idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="fq-q">{q}</span>
                  <span className="pm">+</span>
                </summary>
                <div className="fq-a">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Tu restaurante merece una experiencia digital moderna." lead="MESA fue creado para negocios que quieren evolucionar, automatizar procesos y ofrecer un servicio más rápido y profesional." secondary={{ label: "Ver precios", href: "/precios" }} />
    </>
  )
}
