import Link from "next/link"
import { Phead, SectionMark, Feature, Btn, Ico, DashShot, RecipeShot, ApiShot, CtaBand } from "@/components/marketing/site"

export const metadata = { title: "Gestión e inventario | MESA", description: "La capa de gestión de MESA: control de stock en tiempo real, reportes estratégicos, módulo de ingredientes y costo de recetas, y API de inventario." }

export default function Page() {
  return (
    <>
      <Phead tag="Gestión e inventario" title="El control que tu restaurante necesita por dentro." lead="Más allá del menú y los pedidos, MESA administra lo que sostiene tu rentabilidad: stock en tiempo real, reportes estratégicos, costo de tus recetas y una API para conectar tu inventario." />

      <section className="section bg-white" style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <div className="grid g-4 reveal stagger">
            <Link className="spec-card" href="/stock"><span className="sc-tag">01</span><div className="c-ico"><Ico n="boxes" /></div><h4>Control de stock</h4><p>Inventario que se actualiza solo con cada venta.</p></Link>
            <Link className="spec-card" href="/reportes"><span className="sc-tag">02</span><div className="c-ico"><Ico n="chart" /></div><h4>Reportes estratégicos</h4><p>Datos para decidir con cabeza, no a ciegas.</p></Link>
            <div className="spec-card"><span className="sc-tag">03</span><div className="c-ico"><Ico n="scale" /></div><h4>Ingredientes y recetas</h4><p>Costo real de cada plato y su margen.</p></div>
            <div className="spec-card"><span className="sc-tag">04</span><div className="c-ico"><Ico n="code" /></div><h4>API de inventario</h4><p>Conecta MESA con tus otros sistemas.</p></div>
          </div>
        </div>
      </section>

      <section className="section bg-white" id="stock">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <SectionMark num="01" tag="Control de stock" />
              <h2 className="maxw-h2">Tu inventario, siempre al día.</h2>
              <p className="lead mt-s">Cada pedido descuenta el stock automáticamente. Defines mínimos, recibes alertas de quiebre y evitas vender lo que ya no tienes.</p>
              <ul className="feature-list">
                <Feature title="Descuento automático por venta" text="El stock baja a medida que vendes, sin tocar nada." />
                <Feature title="Alertas de quiebre" text="Te avisa cuando un producto llega a su mínimo." />
                <Feature title="Conteo de inventario" text="Compara tu stock físico con el del sistema." />
              </ul>
              <div className="mt-m"><Btn label="Ver más sobre stock" href="/stock" /></div>
            </div>
            <div className="reveal"><DashShot /></div>
          </div>
        </div>
      </section>

      <section className="section bg-soft" id="reportes">
        <div className="wrap">
          <div className="split rev">
            <div className="reveal"><DashShot /></div>
            <div className="copy reveal">
              <SectionMark num="02" tag="Reportes estratégicos" />
              <h2 className="maxw-h2">Decisiones con datos, no con corazonadas.</h2>
              <p className="lead mt-s">MESA convierte cada venta en información clara: qué se vende, cuánto deja, a qué hora se mueve tu local y qué productos cuidar.</p>
              <ul className="feature-list">
                <Feature title="Ventas por día, hora y canal" text="Entiende cuándo y cómo factura tu negocio." />
                <Feature title="Ranking de productos" text="Tus estrellas y los que conviene revisar." />
                <Feature title="Margen y rentabilidad" text="No solo cuánto vendes: cuánto te queda." />
              </ul>
              <div className="mt-m"><Btn label="Ver más sobre reportes" href="/reportes" /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-white" id="recetas">
        <div className="wrap">
          <div className="split">
            <div className="copy reveal">
              <SectionMark num="03" tag="Ingredientes y costo de recetas" />
              <h2 className="maxw-h2">Sabe cuánto te cuesta cada plato.</h2>
              <p className="lead mt-s">Carga los ingredientes de cada producto y MESA calcula su costo real y su margen. Cuando sube un insumo, sabes al instante qué platos ajustar.</p>
              <ul className="feature-list">
                <Feature title="Recetas por producto" text="Asigna ingredientes y cantidades a cada plato." />
                <Feature title="Costo y margen real" text="Conoce cuánto deja cada producto que vendes." />
                <Feature title="Consumo de insumos" text="El stock de ingredientes baja según lo que vendes." />
              </ul>
            </div>
            <div className="reveal"><RecipeShot /></div>
          </div>
        </div>
      </section>

      <section className="section bg-soft" id="api">
        <div className="wrap">
          <div className="split rev">
            <div className="reveal"><ApiShot /></div>
            <div className="copy reveal">
              <SectionMark num="04" tag="API de inventario" />
              <h2 className="maxw-h2">Conecta MESA con tus otros sistemas.</h2>
              <p className="lead mt-s">La API de inventario de MESA deja que tus plataformas conversen: sincroniza stock, productos y movimientos con tu ERP, e-commerce o contabilidad.</p>
              <ul className="feature-list">
                <Feature title="Sincroniza stock" text="Mantén el inventario alineado entre sistemas." />
                <Feature title="Acceso a productos y movimientos" text="Lee y actualiza datos de forma programática." />
                <Feature title="Pensada para crecer" text="Ideal para cadenas y operaciones con varios sistemas." />
              </ul>
              <div className="mt-m"><Btn label="Hablar con el equipo técnico" variant="dark" href="/demo" /></div>
            </div>
          </div>
        </div>
      </section>

      <CtaBand title="Lleva el control completo de tu operación." lead="Stock, reportes, costos y conexiones: todo en MESA. Te lo mostramos con tu propia carta en una demo." secondary={{ label: "Ver precios", href: "/precios" }} />
    </>
  )
}
