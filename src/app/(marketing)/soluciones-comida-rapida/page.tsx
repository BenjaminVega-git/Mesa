import { Phead, SectionMark, Feature, Ico, Mock, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Software para comida rápida | MESA", description: "MESA acelera la comida rápida con menús QR y pedidos directos: tus clientes eligen, personalizan y confirman en segundos para que la fila no pare." }

const cards = [
  ["burger", "Menú QR digital", "Combos y extras en segundos."],
  ["bell", "Pedidos en tiempo real", "Directo a cocina, sin demoras."],
  ["zap", "Operación ágil", "Pensada para el alto volumen."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Soluciones · Comida rápida" title="Aquí cada segundo cuenta." lead="Tus clientes eligen, personalizan y confirman su pedido en segundos desde el QR. La cocina recibe al instante y la fila sigue avanzando." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">Velocidad pura, sin sacrificar el orden.</h2>
              <p className="lead mt-s">En comida rápida el volumen manda. MESA agiliza la personalización y manda cada pedido directo a cocina, sin errores ni demoras.</p>
              <ul className="feature-list">
                <Feature title="Pide en segundos" text="Del escaneo a la confirmación, sin filas." />
                <Feature title="Personalización clara" text="Extras y combos sin malentendidos." />
                <Feature title="Cocina al instante" text="La orden llega lista para preparar." />
                <Feature title="Más volumen" text="Atiende a más gente en menos tiempo." />
              </ul>
            </div>
            <div className="reveal"><Mock label="Comida rápida — vista pedido" light /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Productos ideales para comida rápida" />
          <h2 className="reveal maxw-h2">Tu combinación recomendada.</h2>
          <div className="grid g-3 mt-l stagger">
            {cards.map(([ico, t, p], i) => (
              <div key={t} className="spec-card reveal">
                <span className="sc-tag">{String(i + 1).padStart(2, "0")}</span>
                <div className="c-ico"><Ico n={ico} /></div><h3>{t}</h3><p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <CtaBand title="Lleva tu negocio al siguiente nivel." lead="Agenda una demo y vemos juntos la mejor configuración para tu rubro." secondary={{ label: "Ver precios", href: "/precios" }} />
    </>
  )
}
