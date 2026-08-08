import { Feature } from "@/components/marketing/site"
import { DemoForm } from "@/components/marketing/demo-form"

export const metadata = { title: "Solicita una demo | MESA", description: "Agenda una demo gratis de MESA. Te mostramos menús QR, pedidos en tiempo real y el panel administrativo con tu propia carta, en 20 minutos." }

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams
  return (
    <>
      <header className="phead" style={{ paddingBottom: 0 }}>
        <div className="halo" />
        <div className="wrap">
          <div className="eyebrow reveal"><span className="num">·</span><span className="tag">Solicita una demo</span></div>
          <h1 className="reveal">Lleva tu restaurante al siguiente nivel.</h1>
          <p className="lead reveal">Déjanos tus datos y te mostramos MESA funcionando con tu propia carta. Una demo de 20 minutos, sin compromiso.</p>
        </div>
      </header>
      <section className="section bg-white">
        <div className="wrap">
          <div className="split" style={{ alignItems: "start" }}>
            <div className="reveal"><DemoForm plan={plan} /></div>
            <div className="reveal">
              <h2 style={{ fontSize: "clamp(1.3rem,2.6vw,1.9rem)" }}>Qué pasa después de enviar.</h2>
              <ul className="feature-list">
                <Feature title="Te contactamos en 24 h" text="Coordinamos un horario que te acomode." />
                <Feature title="Demo con tu carta" text="Vemos MESA con tus productos reales, no un ejemplo genérico." />
                <Feature title="Sin compromiso" text="Resolvemos tus dudas y tú decides con calma." />
                <Feature title="Listo en minutos" text="Si te convence, lo dejamos operativo el mismo día." />
              </ul>
              <div className="card mt-m" style={{ background: "var(--orange-soft)", borderColor: "transparent" }}>
                <h4 style={{ marginBottom: 6 }}>¿Prefieres escribir directo?</h4>
                <p style={{ color: "var(--ink-2)" }}>Escríbenos por WhatsApp o correo y te respondemos al tiro.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
