import { Phead, SectionMark, Feature, Ico, Mock, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Software para cafeterías y panaderías | MESA", description: "MESA agiliza la atención en cafeterías y panaderías con menús QR y pedidos directos, para mover la fila más rápido y mantener la carta al día." }

const cards = [
  ["coffee", "Menú QR digital", "Vitrina digital siempre actualizada."],
  ["bell", "Pedidos en tiempo real", "Directo a quien prepara."],
  ["repeat", "Sin reimpresiones", "Cambia precios cuando quieras."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Soluciones · Cafeterías y panaderías" title="Atención ágil en barra, fila que avanza." lead="Tus clientes ven la vitrina digital, eligen y piden sin hacer cola eterna. Tú mantienes precios y disponibilidad al día en segundos." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">Pensado para el flujo de la mañana.</h2>
              <p className="lead mt-s">En las horas peak, la velocidad lo es todo. MESA reduce el cuello de botella en la barra para que prepares más y esperes menos.</p>
              <ul className="feature-list">
                <Feature title="Fila más corta" text="El cliente pide desde su celular o en el QR." />
                <Feature title="Vitrina siempre fresca" text="Marca agotado y desaparece al instante." />
                <Feature title="Pedidos ordenados" text="Cada orden llega clara a quien prepara." />
                <Feature title="Listo para llevar" text="Ideal para take away y consumo en local." />
              </ul>
            </div>
            <div className="reveal"><Mock label="Cafetería — vista barra" light /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Productos ideales para cafeterías" />
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
