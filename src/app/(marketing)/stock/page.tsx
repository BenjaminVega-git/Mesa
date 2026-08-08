import { Phead, SectionMark, Feature, Ico, Mock, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Control de stock | MESA", description: "Controla el stock de tus productos e ingredientes en tiempo real con MESA. Descuento automático por venta, alertas de quiebre y conteo de inventario." }

const cards = [
  ["boxes", "Sin quiebres", "Repone a tiempo y nunca pierdas una venta."],
  ["alert", "Sin sorpresas", "Alertas automáticas antes de quedarte corto."],
  ["trend", "Menos mermas", "Detecta fugas de inventario y cuida tu margen."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Producto · Stock" title="Control de stock en tiempo real." lead="MESA descuenta tu inventario automáticamente con cada venta y te avisa antes de quedarte sin un producto. Sabes qué tienes, qué falta y cuándo reponer, sin contar a mano." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">Tu inventario, siempre al día.</h2>
              <p className="lead mt-s">Cada pedido que entra por MESA actualiza el stock al instante. Defines mínimos, recibes alertas y evitas vender lo que no tienes o perder ventas por quiebres.</p>
              <ul className="feature-list">
                <Feature title="Descuento automático" text="El stock baja solo a medida que vendes." />
                <Feature title="Alertas de quiebre" text="Te avisa cuando un producto llega a su mínimo." />
                <Feature title="Bloqueo sin stock" text="Evita que se pida algo que ya se agotó." />
                <Feature title="Conteo de inventario" text="Compara tu stock físico con el del sistema." />
              </ul>
            </div>
            <div className="reveal"><Mock label="Stock — control en vivo" light /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Por qué importa" />
          <h2 className="reveal maxw-h2">Menos pérdidas, más control.</h2>
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
      <CtaBand title="Toma el control de tu inventario." lead="Activa MESA y deja que el stock se actualice solo con cada venta." secondary={{ label: "Ver gestión e inventario", href: "/gestion" }} />
    </>
  )
}
