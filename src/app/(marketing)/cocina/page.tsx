import { Phead, SectionMark, Feature, Ico, DashShot, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Comandas en cocina | MESA", description: "Los pedidos de MESA llegan directo a quien prepara, ordenados y sin papel. Tu cocina recibe cada orden al instante y marca su estado." }

const cards = [
  ["clock", "Más rapidez", "Tu equipo ve todo de un vistazo, sin preguntar."],
  ["check", "Menos errores", "Lo que se pidió es lo que se prepara."],
  ["bell", "Nada se pierde", "Cada pedido queda registrado y visible."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Producto · Cocina" title="La cocina recibe cada pedido, sin papel." lead="Cuando un cliente confirma su orden, llega de inmediato a la pantalla de tu cocina o barra. Tu equipo ve qué preparar, en qué orden, y marca cuándo está listo." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split rev">
            <div className="reveal"><DashShot /></div>
            <div className="copy reveal">
              <h2 className="maxw-h2">Adiós a la comanda en papel.</h2>
              <p className="lead mt-s">Los pedidos llegan digitales, legibles y ordenados por mesa. Nadie descifra letras a mano ni pierde una comanda entre el ajetreo del servicio.</p>
              <ul className="feature-list">
                <Feature title="Llegada al instante" text="La orden aparece apenas el cliente confirma." />
                <Feature title="Ordenado por mesa" text="Cada preparación sabe a dónde va." />
                <Feature title="Estados de avance" text="Marca en preparación y entregado." />
                <Feature title="Sin papel ni ruido" text="Menos errores, menos desorden en cocina." />
              </ul>
            </div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Lo que mejora" />
          <h2 className="reveal maxw-h2">Una cocina que fluye en el peak.</h2>
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
      <CtaBand title="Ordena tu cocina con MESA." lead="Deja que cada pedido llegue claro a quien lo prepara." secondary={{ label: "Ver pedidos en tiempo real", href: "/pedidos" }} />
    </>
  )
}
