import { Phead, SectionMark, Feature, Ico, PhoneShot, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Menú QR digital | MESA", description: "El menú QR de MESA deja que tus clientes exploren tu carta, vean fotos y precios actualizados y pidan desde su celular, sin descargar apps." }

const cards = [
  ["smartphone", "Pide en segundos", "Del escaneo al pedido sin esperar a que llegue el mesero."],
  ["tag", "Ticket más alto", "Las fotos y los extras sugeridos invitan a pedir más."],
  ["repeat", "Cero reimpresiones", "Olvídate de reimprimir cartas cada vez que cambia un precio."],
]

export default function Page() {
  return (
    <>
      <Phead tag="Producto · Menú QR" title="Un menú digital que tus clientes aman usar." lead="Escanean el QR de la mesa y exploran tu carta completa desde el celular: fotos, descripciones, precios y variantes, siempre al día. Sin descargar nada." />
      <section className="section bg-white">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <h2 className="maxw-h2">Tu carta, siempre actualizada al instante.</h2>
              <p className="lead mt-s">Cambia un precio, agota un plato o suma una promoción desde el panel y se refleja de inmediato en todas las mesas. Nunca más un menú impreso con información vieja.</p>
              <ul className="feature-list">
                <Feature title="Fotos que venden" text="Cada platillo con imagen, descripción y precio claro." />
                <Feature title="Variantes y extras" text="Tamaños, acompañamientos y opciones personalizadas." />
                <Feature title="Disponible o agotado" text="Marca un producto agotado y desaparece al instante." />
                <Feature title="Sin apps ni descargas" text="Funciona directo en el navegador del celular." />
              </ul>
            </div>
            <div className="reveal"><PhoneShot /></div>
          </div>
        </div>
      </section>
      <section className="section bg-soft">
        <div className="wrap">
          <SectionMark num="01" tag="Por qué importa" />
          <h2 className="reveal maxw-h2">Menos fricción, más ventas por mesa.</h2>
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
      <CtaBand title="Activa tu menú QR hoy mismo." lead="Cargamos tu carta y generamos los códigos de tus mesas en minutos." secondary={{ label: "Ver pedidos en tiempo real", href: "/pedidos" }} />
    </>
  )
}
