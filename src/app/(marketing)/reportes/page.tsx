import { Phead, SectionMark, Feature, Ico, DashShot, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Reportes y estadísticas | MESA", description: "Conoce tus ventas, productos más vendidos, ticket promedio y rendimiento por mesa. MESA te muestra cómo se mueve tu restaurante en tiempo real." }

const cards = [
  ["trend", "Vende más", "Ajusta la carta según lo que de verdad se pide."],
  ["chart", "Planifica mejor", "Organiza turnos y compras según tus horas peak."],
  ["tag", "Cuida el margen", "Detecta qué productos te conviene impulsar."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Producto · Reportes estratégicos" title="Decisiones con datos, no con corazonadas." lead="MESA registra cada pedido y lo convierte en información clara: cuánto vendes, qué platos funcionan, cuál es tu ticket promedio y a qué hora se mueve tu local." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">Tu negocio, en números claros.</h2>
              <p className="lead mt-s">Cada venta que pasa por MESA alimenta tus reportes automáticamente. Sin planillas manuales: abres el panel y ves cómo va el día, la semana o el mes.</p>
              <ul className="feature-list">
                <Feature title="Ventas en tiempo real" text="Mira los ingresos del turno a medida que ocurren." />
                <Feature title="Productos más vendidos" text="Identifica tus estrellas y los que no rotan." />
                <Feature title="Ticket promedio" text="Sabe cuánto gasta en promedio cada mesa." />
                <Feature title="Horas peak" text="Descubre cuándo se llena para planificar tu equipo." />
              </ul>
            </div>
            <div className="reveal"><DashShot /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Para qué te sirve" />
          <h2 className="reveal maxw-h2">Información que se traduce en plata.</h2>
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
      <CtaBand title="Empieza a decidir con datos." lead="Activa MESA y mira tu negocio con claridad desde el primer servicio." secondary={{ label: "Ver el panel", href: "/panel" }} />
    </>
  )
}
