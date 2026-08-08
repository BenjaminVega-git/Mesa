import { Phead, SectionMark, Feature, Ico, Mock, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Mesas y códigos QR | MESA", description: "Cada mesa de tu local con su código QR único para pedir. Gestiona mesas, zonas y disponibilidad desde un solo panel con MESA." }

const cards = [
  ["qr", "Listo en minutos", "Genera e imprime todos tus QR de una vez."],
  ["panel", "Control de sala", "Mira el estado de cada mesa desde el panel."],
  ["repeat", "Sin reimpresiones", "El QR es fijo aunque cambies precios o platos."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Producto · Mesas QR" title="Cada mesa con su código único para pedir." lead="Generamos un QR por mesa que conecta cada pedido con su ubicación exacta. Imprime, pega y empieza a recibir órdenes ordenadas por mesa." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split rev">
            <div className="reveal"><Mock label="Mesas y QR" light /></div>
            <div className="copy reveal">
              <h2 className="maxw-h2">Toda tu sala, organizada por mesa.</h2>
              <p className="lead mt-s">Crea tus mesas y zonas, asigna su QR y listo. Cuando un cliente pide, sabes desde qué mesa viene sin preguntar.</p>
              <ul className="feature-list">
                <Feature title="Un QR por mesa" text="Generado automáticamente y listo para imprimir." />
                <Feature title="Zonas y salones" text="Organiza terraza, salón principal y barra." />
                <Feature title="Pedido ubicado" text="Cada orden sabe a qué mesa pertenece." />
                <Feature title="Reutilizable" text="Cambia la carta sin reimprimir los códigos." />
              </ul>
            </div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Por qué importa" />
          <h2 className="reveal maxw-h2">El orden empieza en la mesa.</h2>
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
      <CtaBand title="Ordena tu sala con MESA." lead="Generamos los QR de todas tus mesas el mismo día." secondary={{ label: "Ver menú QR", href: "/menu-qr" }} />
    </>
  )
}
