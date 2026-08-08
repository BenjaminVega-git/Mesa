import { Phead, SectionMark, Feature, Ico, Mock, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Software para restaurantes | MESA", description: "MESA ayuda a restaurantes a acelerar la rotación de mesas, reducir errores y aumentar el ticket promedio con menús QR y pedidos en tiempo real." }

const cards = [
  ["smartphone", "Menú QR digital", "Tus clientes piden desde la mesa."],
  ["bell", "Pedidos en tiempo real", "La cocina recibe al instante."],
  ["panel", "Panel administrativo", "Toda la sala en un lugar."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Soluciones · Restaurantes" title="Más rotación de mesas, menos errores en el servicio." lead="Ofrece una experiencia moderna a tus comensales: piden desde el QR, la cocina recibe al instante y tú controlas todo el salón desde un panel." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">Diseñado para el ritmo de un restaurante.</h2>
              <p className="lead mt-s">Cuando el local se llena, cada minuto cuenta. MESA agiliza la toma de pedidos para que tu equipo atienda más mesas sin perder calidad.</p>
              <ul className="feature-list">
                <Feature title="Rotación más rápida" text="Menos tiempo entre que se sientan y piden." />
                <Feature title="Ticket más alto" text="Fotos y sugerencias que invitan a pedir más." />
                <Feature title="Salón bajo control" text="Estado de cada mesa y pedido en vivo." />
                <Feature title="Carta siempre al día" text="Cambia precios y platos al instante." />
              </ul>
            </div>
            <div className="reveal"><Mock label="Restaurante — vista salón" light /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Productos ideales para restaurantes" />
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
