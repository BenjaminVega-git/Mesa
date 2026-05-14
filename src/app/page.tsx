import Link from "next/link"
import Image from "next/image"
import mesaLogo from "@/image/MESA.svg"

const menuLinks = [
  { label: "Categorías", href: "/admin/categories" },
  { label: "Productos", href: "/admin/products" },
  { label: "Mesas", href: "/admin/tables" },
  { label: "Pedidos", href: "/admin/orders" },
]

const benefits = [
  {
    title: "Categorías del menú",
    href: "/admin/categories",
    description: "Organiza tu carta por categorías para que cada producto sea fácil de encontrar y editar.",
  },
  {
    title: "Productos y precios",
    href: "/admin/products",
    description: "Administra platos, descripciones, precios, estado visible e imagen de cada producto.",
  },
  {
    title: "Mesas del local",
    href: "/admin/tables",
    description: "Crea mesas y usa su código QR asociado para recibir pedidos desde el local.",
  },
  {
    title: "Seguimiento de pedidos",
    href: "/admin/orders",
    description: "Revisa pedidos por mesa, estado, tiempo de ingreso y total durante el servicio.",
  },
]

const metrics = [
  { label: "Ventas del día", value: "$428k", detail: "Desde pedidos completados" },
  { label: "Pedidos activos", value: "18", detail: "Nuevos, en preparación o listos" },
  { label: "Mesas registradas", value: "16", detail: "Cada mesa mantiene su QR" },
  { label: "Productos", value: "42", detail: "Platos y bebidas del menú" },
]

const orders = [
  { table: "Mesa 04", item: "Pedido #101 · $25.990", status: "Nuevo", tone: "bg-orange-100 text-orange-700" },
  { table: "Mesa 02", item: "Pedido #102 · $18.990", status: "Preparación", tone: "bg-stone-900 text-white" },
  { table: "Mesa 07", item: "Pedido #103 · $32.990", status: "Listo", tone: "bg-emerald-100 text-emerald-700" },
]

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-stone-50 text-stone-950">
      <section className="relative">
        <div className="absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.18),_transparent_34%),linear-gradient(135deg,_#fff7ed_0%,_#fafaf9_52%,_#f5f5f4_100%)]" />

        <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center" aria-label="MESA inicio">
            <Image
              src={mesaLogo}
              alt="MESA"
              className="h-12 w-28 object-contain object-left"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-medium text-stone-600 md:flex">
            {menuLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-2 transition hover:bg-white hover:text-stone-950"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <nav className="flex items-center gap-2 text-sm font-medium">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-stone-700 transition hover:bg-white hover:text-stone-950"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-stone-950 px-4 py-2 text-white shadow-sm transition hover:bg-stone-800"
            >
              Crear restaurante
            </Link>
          </nav>
        </header>

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1fr_0.92fr] lg:px-10 lg:pb-24 lg:pt-14">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700 shadow-sm">
              Sistema para restaurantes y cafeterías
            </div>

            <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">
              Administra categorías, productos, mesas y pedidos desde una experiencia simple.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
              MESA reúne las herramientas principales de tu operación: menú,
              productos, mesas con QR y seguimiento de pedidos en una web app clara
              para el día a día.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
              >
                Crear mi restaurante
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-stone-100"
              >
                Iniciar sesión
              </Link>
            </div>

            <div className="mt-8 grid max-w-lg grid-cols-3 gap-3 text-sm text-stone-600">
              <div>
                <p className="text-xl font-semibold text-stone-950">Carta</p>
                <p>Categorías y productos</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-stone-950">Mesas</p>
                <p>QR por mesa</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-stone-950">Pedidos</p>
                <p>Estados y totales</p>
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <div className="absolute -left-8 top-12 h-28 w-28 rounded-full bg-orange-200/70 blur-3xl" />
            <div className="absolute -right-8 bottom-20 h-32 w-32 rounded-full bg-amber-100 blur-3xl" />

            <div className="relative rounded-[2.25rem] border border-stone-200 bg-stone-950 p-3 shadow-2xl shadow-stone-900/20">
              <div className="rounded-[1.75rem] bg-stone-50 p-4">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-stone-500">Panel admin</p>
                    <h2 className="text-xl font-semibold tracking-tight">Café Aurora</h2>
                  </div>
                  <div className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white">
                    Abierto
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-stone-500">Ventas del día</p>
                      <p className="text-3xl font-semibold tracking-tight">$428k</p>
                    </div>
                    <div className="rounded-2xl bg-orange-50 px-3 py-2 text-right">
                      <p className="text-xs font-semibold text-orange-700">24 completados</p>
                      <p className="text-[11px] text-stone-500">pedidos cerrados</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="h-2 rounded-full bg-stone-100">
                      <div className="h-2 w-4/5 rounded-full bg-orange-500" />
                    </div>
                    <div className="flex justify-between text-xs text-stone-500">
                      <span>Calculado desde pedidos completados</span>
                      <span>Hoy</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-3xl bg-orange-500 p-4 text-white shadow-lg shadow-orange-500/20">
                    <p className="text-xs font-medium text-orange-100">Pedidos activos</p>
                    <p className="mt-2 text-3xl font-semibold">18</p>
                  </div>
                  <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
                    <p className="text-xs font-medium text-stone-500">Mesas</p>
                    <p className="mt-2 text-3xl font-semibold">16</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.table}
                      className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-stone-950">{order.table}</p>
                          <p className="mt-1 text-xs leading-5 text-stone-500">{order.item}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${order.tone}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
            Módulos del panel
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Entra directo a las áreas principales de tu restaurante.
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit) => (
            <Link
              href={benefit.href}
              key={benefit.title}
              className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="mb-5 h-10 w-10 rounded-2xl bg-orange-100" />
              <h3 className="text-lg font-semibold text-stone-950">{benefit.title}</h3>
              <p className="mt-3 text-sm leading-6 text-stone-600">{benefit.description}</p>
              <span className="mt-5 inline-flex text-sm font-semibold text-orange-600">
                Abrir módulo
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10">
        <div className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
                Vista del negocio
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                Indicadores pensados para el panel administrador.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-stone-600">
              Información simulada, basada en lo que tendrá sentido medir dentro
              de MESA: ventas, pedidos, mesas y productos.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-3xl border border-stone-200 bg-stone-50 p-5"
              >
                <p className="text-sm font-medium text-stone-500">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                  {metric.value}
                </p>
                <p className="mt-2 text-sm text-stone-600">{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 lg:px-10 lg:pb-24">
        <div className="rounded-[2rem] bg-stone-950 px-6 py-10 text-center text-white shadow-2xl shadow-stone-900/10 sm:px-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-300">
            Empieza con tu local
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Crea tu restaurante y configura categorías, productos, mesas y pedidos desde un panel simple.
          </h2>
          <Link
            href="/register"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
          >
            Crear mi restaurante
          </Link>
        </div>
      </section>
    </main>
  )
}
