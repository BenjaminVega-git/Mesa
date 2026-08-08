import { Phead, SectionMark, Ico, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Cómo funciona | MESA — del escaneo a la mesa en 5 pasos", description: "Descubre cómo funciona MESA: tus clientes escanean el QR, exploran el menú, piden, tu equipo recibe la orden y el platillo llega a la mesa correcta." }

const steps = [
  ["Escanea el QR", "El cliente apunta la cámara al código de su mesa. Se abre tu menú al instante, sin instalar nada."],
  ["Explora el menú", "Navega por categorías, ve fotos, descripciones, precios y variantes de cada platillo."],
  ["Realiza el pedido", "Selecciona los productos, elige extras y confirma su orden en segundos."],
  ["El equipo recibe", "La orden aparece de inmediato en la pantalla de tu equipo y en cocina, lista para preparar."],
  ["Entregado", "El platillo se prepara y llega a la mesa correcta. Todo queda registrado en tu panel."],
]
const setup = [
  ["box", "1 · Cargamos tu menú", "Nos pasas tu carta y la dejamos lista con categorías, precios y fotos."],
  ["qr", "2 · Generamos tus QR", "Un código por mesa, listo para imprimir y pegar."],
  ["rocket", "3 · A recibir pedidos", "Tu equipo entra al panel y empieza a operar de inmediato."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Cómo funciona" title="Del escaneo a la mesa, en cinco pasos." lead="MESA conecta a tus clientes con tu cocina en segundos. Así se ve un servicio completo, de principio a fin." />
      <section className="section bg-white">
        <div className="wrap">
          <SectionMark num="01" tag="El recorrido" />
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
          <div className="spec-card reveal mt-l" style={{ background: "var(--orange-soft)", borderColor: "transparent" }}>
            <h3 style={{ marginBottom: 8 }}>¿Y la administración?</h3>
            <p style={{ color: "var(--ink-2)" }}>Mientras todo esto pasa, tú ves cada pedido, mesa y estado desde el panel, en tiempo real.</p>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="02" tag="Puesta en marcha" />
          <h2 className="reveal maxw-h2">Listo para operar el mismo día.</h2>
          <div className="grid g-3 mt-l stagger">
            {setup.map(([ico, t, p], i) => (
              <div key={t} className="spec-card reveal">
                <span className="sc-tag">{String(i + 1).padStart(2, "0")}</span>
                <div className="c-ico"><Ico n={ico} /></div><h3>{t}</h3><p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <CtaBand title="Veámoslo funcionando en tu local." lead="Te mostramos MESA con tu propia carta en una demo de 20 minutos." secondary={{ label: "Ver precios", href: "/precios" }} />
    </>
  )
}
