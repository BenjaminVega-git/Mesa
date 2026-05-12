import Link from "next/link"

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="mx-auto max-w-6xl">

        <h1 className="text-3xl font-bold mb-2">
          Panel administrador
        </h1>

        <p className="text-zinc-400 mb-8">
          Gestiona tu restaurante, menú, mesas y pedidos.
        </p>

        <div className="grid gap-4 md:grid-cols-4">

          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">

            <h2 className="font-semibold mb-2">
              Categorías
            </h2>

            <p className="text-sm text-zinc-400 mb-4">
              Organiza tu menú.
            </p>

            <Link
              href="/admin/categories"
              className="inline-block rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold hover:bg-orange-600 transition"
            >
              Crear categoría
            </Link>

          </div>

          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">

            <h2 className="font-semibold mb-2">
              Productos
            </h2>

            <p className="text-sm text-zinc-400 mb-4">
              Agrega platos y precios.
            </p>

            <Link
              href="/admin/products"
              className="inline-block rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold hover:bg-orange-600 transition"
            >
              Crear producto
            </Link>

          </div>

          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">

            <h2 className="font-semibold mb-2">
              Mesas
            </h2>

            <p className="text-sm text-zinc-400 mb-4">
              Genera códigos QR.
            </p>

            <Link
              href="/admin/tables"
              className="inline-block rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold hover:bg-orange-600 transition"
            >
              Crear mesa
            </Link>

          </div>

          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">

            <h2 className="font-semibold mb-2">
              Pedidos
            </h2>

            <p className="text-sm text-zinc-400 mb-4">
              Revisa actividad.
            </p>

            <Link
              href="/admin/orders"
              className="inline-block rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold hover:bg-orange-600 transition"
            >
              Ver pedidos
            </Link>

          </div>

        </div>

      </div>
    </main>
  )
}