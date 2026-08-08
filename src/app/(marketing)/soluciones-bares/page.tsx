import { Phead, SectionMark, Feature, Ico, Mock, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Software para bares y cervecerías | MESA", description: "MESA ayuda a bares y cervecerías a tomar pedidos más rápido, reducir esperas y mantener el control de cada mesa en las horas de mayor movimiento." }

const cards = [
  ["wine", "Menú QR digital", "Carta de tragos siempre al día."],
  ["bell", "Pedidos en tiempo real", "Cada ronda directo a la barra."],
  ["qr", "Mesas y QR", "Pedido ubicado por mesa."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Soluciones · Bares y cervecerías" title="Pedidos rápidos, rondas que no se cortan." lead="En la hora peak, tus clientes piden desde el QR de su mesa y tu equipo se enfoca en servir. Menos esperas, más rondas, mejor noche." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">Hecho para la noche más movida.</h2>
              <p className="lead mt-s">Cuando todas las mesas piden a la vez, MESA ordena el caos: cada pedido llega claro y asociado a su mesa, sin perder ninguna ronda.</p>
              <ul className="feature-list">
                <Feature title="Más rondas por mesa" text="Pedir es tan rápido como escanear." />
                <Feature title="Sin perder comandas" text="Todo queda registrado por mesa." />
                <Feature title="Equipo enfocado" text="Tus garzones sirven, no anotan." />
                <Feature title="Promos al instante" text="Activa la promo de la noche en segundos." />
              </ul>
            </div>
            <div className="reveal"><Mock label="Bar — vista mesas" light /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Productos ideales para bares" />
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
