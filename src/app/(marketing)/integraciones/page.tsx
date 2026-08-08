import { SectionMark, Btn, Ico, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Integraciones | MESA (próximamente)", description: "MESA está construyendo integraciones con pagos, apps de delivery y facturación electrónica. Conoce lo que viene en el roadmap." }

const cards = [
  ["tag", "Pagos en línea", "Que tus clientes paguen desde el celular con los medios más usados en Chile."],
  ["repeat", "Apps de delivery", "Gestionar pedidos de las principales apps desde un solo lugar."],
  ["box", "Facturación electrónica", "Boletas y facturas conectadas a tu operación diaria."],
]

export default function Page() {
  return (
    <>
      <header className="phead">
        <div className="sheen" /><div className="grain" /><div className="halo" />
        <div className="wrap">
          <div className="eyebrow reveal"><span className="num">·</span><span className="tag">Integraciones</span></div>
          <h1 className="reveal">Conecta MESA con tus herramientas. <span className="soon">Próximamente</span></h1>
          <p className="lead reveal">Estamos construyendo integraciones para que MESA converse con los servicios que ya usas: pagos, delivery y facturación. Esto es lo que viene en el camino.</p>
          <div className="cta-row mt-m reveal"><Btn label="Solicita una demo" href="/demo" /></div>
        </div>
      </header>
      <section className="section bg-white">
        <div className="wrap">
          <SectionMark num="01" tag="En el roadmap" />
          <h2 className="reveal maxw-h2">Lo que estamos preparando.</h2>
          <div className="grid g-3 mt-l stagger">
            {cards.map(([ico, t, p]) => (
              <div key={t} className="spec-card reveal"><span className="soon">Próximamente</span><div className="c-ico"><Ico n={ico} /></div><h3>{t}</h3><p>{p}</p></div>
            ))}
          </div>
          <p className="center muted mt-m" style={{ fontSize: 13 }}>Estas funciones están en desarrollo y aún no se encuentran disponibles. ¿Te interesa alguna? Cuéntanos en la demo y la priorizamos.</p>
        </div>
      </section>
      <CtaBand title="¿Qué integración necesitas?" lead="Agenda una demo y cuéntanos con qué herramientas trabajas. Nos ayuda a priorizar." secondary={{ label: "Ver cómo funciona", href: "/como-funciona" }} />
    </>
  )
}
