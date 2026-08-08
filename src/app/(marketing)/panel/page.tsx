import { Phead, SectionMark, Feature, Ico, DashShot, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Panel administrativo | MESA", description: "Controla categorías, productos, mesas, pedidos y meseros desde un solo panel. Toda la operación de tu restaurante en un lugar con MESA." }

const cards = [
  ["settings", "Simple de usar", "Sin manuales: tu equipo lo entiende solo."],
  ["shield", "Roles y permisos", "Cada quien ve y hace lo que le corresponde."],
  ["chart", "Visión completa", "Mira cómo se mueve tu local de un vistazo."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Producto · Panel" title="Toda tu operación, en un solo lugar." lead="Categorías, productos, variantes, mesas, pedidos y meseros. El panel de MESA reúne todo lo que necesitas para administrar tu local sin saltar entre herramientas." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">Administra sin complicaciones.</h2>
              <p className="lead mt-s">Una interfaz limpia pensada para que cualquier persona del equipo la use desde el primer día. Lo que necesitas, donde lo esperas.</p>
              <ul className="feature-list">
                <Feature title="Productos y categorías" text="Crea, edita y organiza tu carta completa." />
                <Feature title="Gestión de meseros" text="Usuarios, roles y permisos para tu equipo." />
                <Feature title="Pedidos en vivo" text="Sigue cada orden y su estado en tiempo real." />
                <Feature title="Todo conectado" text="Un cambio en el panel se refleja al instante." />
              </ul>
            </div>
            <div className="reveal"><DashShot /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Hecho para tu día a día" />
          <h2 className="reveal maxw-h2">Decisiones claras, operación bajo control.</h2>
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
      <CtaBand title="Toma el control de tu restaurante." lead="Un panel, toda tu operación. Pruébalo con una demo." secondary={{ label: "Ver cómo funciona", href: "/como-funciona" }} />
    </>
  )
}
