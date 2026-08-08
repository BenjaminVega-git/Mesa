import { Phead, SectionMark, Feature, Ico, DashShot, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Pedidos en tiempo real | MESA", description: "Cada pedido de tus clientes llega al instante a tu equipo y cocina. Seguimiento del estado de cada orden en tiempo real con MESA." }

const cards = [
  ["clock", "Menos espera", "El cliente pide cuando quiere, sin buscar al mesero."],
  ["check", "Menos errores", "Lo que se pide es exactamente lo que llega a cocina."],
  ["users", "Equipo aliviado", "Tus meseros se enfocan en atender, no en anotar."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Producto · Pedidos" title="Cada pedido llega al instante a tu equipo." lead="Apenas el cliente confirma, la orden aparece en la pantalla de tu equipo y en cocina. Sin malentendidos, sin comandas perdidas, sin idas y vueltas." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">De la mesa a la cocina, sin intermediarios.</h2>
              <p className="lead mt-s">El pedido digital viaja directo: tu equipo lo ve, lo prepara y actualiza su estado. Todos saben qué falta y qué ya salió.</p>
              <ul className="feature-list">
                <Feature title="Llegada instantánea" text="La orden aparece en pantalla en el momento." />
                <Feature title="Estados claros" text="Pendiente, en preparación y entregado." />
                <Feature title="Adiós a la comanda verbal" text="Se acaban las confusiones del 'yo pedí otra cosa'." />
                <Feature title="Por mesa, ordenado" text="Cada pedido asociado a su mesa correcta." />
              </ul>
            </div>
            <div className="reveal"><DashShot /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Lo que cambia" />
          <h2 className="reveal maxw-h2">Un servicio más rápido y sin errores.</h2>
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
      <CtaBand title="Haz que cada pedido fluya." lead="Activa MESA y deja que la operación se mueva sola." secondary={{ label: "Ver el panel", href: "/panel" }} />
    </>
  )
}
