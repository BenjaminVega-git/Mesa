import Link from "next/link"
import { Btn, SectionMark } from "@/components/marketing/site"

export const metadata = { title: "Precios | MESA — planes para cada tipo de restaurante", description: "Planes de MESA en pesos chilenos para restaurantes, cafeterías y bares. Sin contratos largos. Empieza con una demo gratis y elige el plan que te acomode." }

const PlanTick = ({ on = true }: { on?: boolean }) => (
  <span className="tick" style={on ? undefined : {}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
)
const BarsIco = () => (
  <div className="si"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6" /></svg></div>
)

type Plan = {
  name: string; desc: string; featured?: boolean; custom?: boolean
  was?: string; now?: string; amt?: string; note: string
  support: string; supportSub: string
  feats: [string, boolean][]; btn: { label: string; variant: "orange" | "dark" }
}
const plans: Plan[] = [
  {
    name: "Plan 15", desc: "Para cafeterías y locales pequeños de hasta 15 mesas.",
    was: "$2.500.000 + IVA", now: "$1.250.000", note: "1 – 15 mesas · pago único",
    support: "+ $150.000 / mes · Soporte Tier 3 24/7", supportSub: "Complemento recomendado para operación continua.",
    feats: [["Menú QR + carga con IA", true], ["Vistas Cliente, Cocina, Mesero y Admin", true], ["Reportes básicos", true], ["Panel administrativo", true], ["Reportes avanzados", false], ["Gestión completa de meseros", false]],
    btn: { label: "Contactar", variant: "dark" },
  },
  {
    name: "Plan 50", desc: "Para restaurantes en marcha con hasta 50 mesas.", featured: true,
    was: "$6.000.000 + IVA", now: "$3.000.000", note: "16 – 50 mesas · pago único",
    support: "+ $300.000 / mes · Soporte Tier 3 24/7", supportSub: "Complemento recomendado para operación continua.",
    feats: [["Todo lo del Plan 15", true], ["Reportes avanzados y horas peak", true], ["Gestión completa de meseros", true], ["Soporte prioritario", true], ["Operación de alto volumen", false], ["Multi-sucursal", false]],
    btn: { label: "Contactar", variant: "orange" },
  },
  {
    name: "Plan 100", desc: "Para operaciones de alto volumen, hasta 100 mesas.",
    was: "$10.000.000 + IVA", now: "$5.000.000", note: "50 – 100 mesas · pago único",
    support: "+ $450.000 / mes · Soporte Tier 3 24/7", supportSub: "Complemento recomendado para operación continua.",
    feats: [["Todo lo del Plan 50", true], ["Operación de alto volumen", true], ["Prioridad en soporte", true], ["Dashboard de rendimiento", true], ["Multi-sucursal centralizado", false], ["Integraciones a medida", false]],
    btn: { label: "Contactar", variant: "dark" },
  },
  {
    name: "Personalizado", desc: "Para grupos y franquicias con 100+ mesas o varias sucursales.", custom: true,
    amt: "A medida", note: "100+ mesas o varias sucursales",
    support: "Soporte a medida", supportSub: "Definimos el nivel según tu operación.",
    feats: [["Multi-sucursal centralizado", true], ["Reportes consolidados", true], ["Integraciones a medida", true], ["Onboarding dedicado", true], ["Gerente de cuenta", true], ["SLA garantizado", true]],
    btn: { label: "Hablar con ventas", variant: "dark" },
  },
]

const cmpHead = ["Funcionalidad", "Plan 15", "Plan 50", "Plan 100", "Personalizado"]
const cmpRows: [string, ...(boolean | string)[]][] = [
  ["Menú QR digital", true, true, true, true],
  ["Carga de menú con IA", true, true, true, true],
  ["Pedidos en tiempo real", true, true, true, true],
  ["Vista cocina", true, true, true, true],
  ["Panel administrativo", true, true, true, true],
  ["Reportes básicos", true, true, true, true],
  ["Reportes avanzados y horas peak", false, true, true, true],
  ["Gestión completa de meseros", false, true, true, true],
  ["Operación de alto volumen", false, false, true, true],
  ["Multi-sucursal centralizado", false, false, false, true],
  ["Integraciones a medida", false, false, false, true],
  ["Soporte Tier 3 24/7", "+$150K/mes", "+$300K/mes", "+$450K/mes", "A medida"],
]

const faqs = [
  ["¿Hay periodo de prueba?", "Sí. Puedes empezar con un mes de prueba sin costo para ver MESA funcionando en tu local antes de decidir."],
  ["¿El precio es por mesas o por usuario?", "El valor depende de la cantidad de mesas. Los planes van desde 1–15 mesas hasta 50–100 mesas o más. Todos los planes incluyen acceso completo a la plataforma; el soporte Tier 3 24/7 es un complemento opcional."],
  ["¿Qué incluye el Soporte Tier 3 24/7?", "Es un complemento recomendado que garantiza atención especializada las 24 horas los 7 días de la semana. El costo varía según tu plan: $150.000/mes para Plan 15, $300.000/mes para Plan 50, y $450.000/mes para Plan 100."],
  ["¿Tengo que firmar un contrato largo?", "No. El acceso a la plataforma es un pago único y el soporte es mes a mes. Puedes cancelar el complemento cuando quieras, sin permanencia obligatoria."],
  ["¿Necesito comprar hardware?", "No. MESA funciona en los dispositivos que ya tienes. Tus clientes piden desde su propio celular vía QR. Para la cocina basta una pantalla o tablet con navegador. No hay nada que instalar."],
  ["¿Puedo cambiar de plan después?", "Sí. Si tu negocio crece y necesitas más mesas, podemos adecuar tu plan. Habla con un ejecutivo para revisar la diferencia de valor y migrar sin interrupciones."],
]

export default function Page() {
  return (
    <>
      <header className="phead-precios">
        <div className="sheen" /><div className="grain" /><div className="halo" />
        <div className="grid-dots" />
        <div className="wrap">
          <div className="copy">
            <div className="free-badge reveal"><span className="dot" /> Primer mes de prueba sin costo</div>
            <div className="eyebrow reveal"><span className="num">·</span><span className="tag">Precios</span></div>
            <h1 className="reveal">Un plan para cada tamaño de local.</h1>
            <p className="lead reveal">Precios en pesos chilenos, sin contratos largos ni sorpresas. El costo depende de la cantidad de mesas. Cancela cuando quieras.</p>
          </div>
          <div className="qr-visual reveal">
            <div className="qr-phone">
              <div className="nub" />
              <div className="ph-top">
                <div className="pm"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></div>
                <b>Mesa 07</b><span>tumesaqr.com</span>
              </div>
              <div className="cats"><i className="on">Todo</i><i>Pizza</i><i>Bebidas</i></div>
              <div className="item"><div className="th" /><div className="meta"><b>Pizza Margherita</b><span>Masa delgada, mozzarella</span></div><div className="pr">$8.900</div></div>
              <div className="item"><div className="th" /><div className="meta"><b>Café Latte</b><span>Doble shot, leche caliente</span></div><div className="pr">$3.500</div></div>
              <div className="ph-btn">Confirmar pedido →</div>
            </div>
            <div className="qr-card">
              <div className="qr-bracket-wrap">
                <div className="qr-brackets">
                  <svg className="qr-svg" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
                    <rect width="80" height="80" fill="#fff" rx="4" />
                    <rect x="8" y="8" width="22" height="22" fill="none" stroke="#111" strokeWidth="3.5" /><rect x="13" y="13" width="12" height="12" fill="#111" />
                    <rect x="50" y="8" width="22" height="22" fill="none" stroke="#111" strokeWidth="3.5" /><rect x="55" y="13" width="12" height="12" fill="#111" />
                    <rect x="8" y="50" width="22" height="22" fill="none" stroke="#111" strokeWidth="3.5" /><rect x="13" y="55" width="12" height="12" fill="#111" />
                    <rect x="36" y="8" width="6" height="6" fill="#F5871F" /><rect x="44" y="8" width="6" height="6" fill="#111" /><rect x="36" y="16" width="6" height="6" fill="#111" /><rect x="44" y="16" width="6" height="6" fill="#F5871F" /><rect x="36" y="24" width="6" height="6" fill="#F5871F" />
                    <rect x="8" y="36" width="6" height="6" fill="#111" /><rect x="16" y="36" width="6" height="6" fill="#F5871F" /><rect x="24" y="36" width="6" height="6" fill="#111" /><rect x="32" y="36" width="6" height="6" fill="#F5871F" /><rect x="40" y="36" width="6" height="6" fill="#111" /><rect x="48" y="36" width="6" height="6" fill="#F5871F" /><rect x="56" y="36" width="6" height="6" fill="#111" /><rect x="64" y="36" width="6" height="6" fill="#F5871F" />
                    <rect x="8" y="44" width="6" height="6" fill="#F5871F" /><rect x="16" y="44" width="6" height="6" fill="#111" /><rect x="24" y="44" width="6" height="6" fill="#F5871F" /><rect x="32" y="44" width="6" height="6" fill="#111" /><rect x="40" y="44" width="6" height="6" fill="#F5871F" /><rect x="48" y="44" width="6" height="6" fill="#111" />
                    <rect x="32" y="50" width="6" height="6" fill="#F5871F" /><rect x="40" y="50" width="6" height="6" fill="#111" /><rect x="48" y="50" width="6" height="6" fill="#F5871F" /><rect x="56" y="50" width="6" height="6" fill="#111" /><rect x="64" y="50" width="6" height="6" fill="#F5871F" />
                    <rect x="32" y="58" width="6" height="6" fill="#111" /><rect x="40" y="58" width="6" height="6" fill="#F5871F" /><rect x="48" y="58" width="6" height="6" fill="#111" /><rect x="56" y="58" width="6" height="6" fill="#F5871F" />
                    <rect x="32" y="66" width="6" height="6" fill="#F5871F" /><rect x="40" y="66" width="6" height="6" fill="#111" /><rect x="56" y="66" width="6" height="6" fill="#111" /><rect x="64" y="66" width="6" height="6" fill="#F5871F" />
                  </svg>
                </div>
                <div className="qr-scan-line" />
              </div>
              <div className="qr-label">MESA 07</div>
              <div className="qr-sub">Escanéame para pedir</div>
            </div>
          </div>
        </div>
      </header>

      <section className="section bg-white" style={{ paddingTop: "clamp(20px,4vw,40px)" }}>
        <div className="wrap">
          <div className="price-grid reveal">
            {plans.map((pl) => (
              <div key={pl.name} className={`plan${pl.featured ? " featured" : ""}${pl.custom ? " custom" : ""}`}>
                {pl.featured && <span className="badge">Más elegido</span>}
                <div className="pname">{pl.name}</div>
                <div className="pdesc">{pl.desc}</div>
                <div className="pprice">
                  {pl.now ? (
                    <>
                      <div className="original"><span>{pl.was}</span><span className="off-tag">50% OFF lanzamiento</span></div>
                      <div className="real"><span className="amt">{pl.now}</span><span className="per">+ IVA</span></div>
                    </>
                  ) : (
                    <div className="real"><span className="amt">{pl.amt}</span></div>
                  )}
                </div>
                <div className="pnote">{pl.note}</div>
                <div className="support-add"><BarsIco /><div><strong>{pl.support}</strong>{pl.supportSub}</div></div>
                <ul>
                  {pl.feats.map(([f, on]) => (
                    <li key={f} className={on ? "" : "off"}><PlanTick on={on} />{f}</li>
                  ))}
                </ul>
                <Btn label={pl.btn.label} variant={pl.btn.variant} href={`/demo?plan=${encodeURIComponent(pl.name)}`} block />
              </div>
            ))}
          </div>
          <p className="center muted mt-m" style={{ fontSize: 12.5 }}>Los valores son referenciales en pesos chilenos (CLP). El costo de procesamiento de menú con IA se absorbe en el setup. Habla con un ejecutivo para una propuesta a tu medida.</p>
        </div>
      </section>

      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Comparativa de planes" />
          <h2 className="reveal maxw-h2">Qué incluye cada plan.</h2>
          <div className="cmp-scroll mt-l reveal">
            <table className="cmp">
              <thead><tr>{cmpHead.map((h, i) => <th key={h} className={i === 0 ? "" : i === 2 ? "center mesa" : "center"}>{h}</th>)}</tr></thead>
              <tbody>
                {cmpRows.map((r) => (
                  <tr key={r[0] as string}>
                    <td>{r[0]}</td>
                    {r.slice(1).map((v, i) => (
                      <td key={i} className="center">{typeof v === "boolean" ? (v ? <span className="yes">✓</span> : <span className="no">✕</span>) : v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section bg-white">
        <div className="wrap">
          <SectionMark num="02" tag="Dudas sobre precios" />
          <h2 className="reveal maxw-h2">Lo que sueles preguntarte antes de contratar.</h2>
          <div className="faq-v2 mt-l reveal">
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

      <section className="section bg-white" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="cta-band reveal">
            <div className="halo" />
            <h2>Empieza hoy, sin compromiso.</h2>
            <p className="lead">Configuramos tu carta, generamos los QR de cada mesa y te dejamos recibiendo comandas el mismo día.</p>
            <div className="row"><Btn label="Solicita una demo" href="/demo" /><Link className="btn btn-ghost" href="/como-funciona">Ver cómo funciona →</Link></div>
          </div>
        </div>
      </section>
    </>
  )
}
