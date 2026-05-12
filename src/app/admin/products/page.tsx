"use client"

import Link from "next/link"
import { encodeId } from "@/lib/hashids"
import { useProductList } from "@/hooks/useProductList"

export default function ProductsPage() {
  const { products, loading, error, deleteProduct } = useProductList()

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="mx-auto max-w-6xl">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Productos</h1>
            <p className="text-zinc-400 mt-2">
              Gestiona los productos de tu restaurante.
            </p>
          </div>

          <Link
            href="/admin/products/create"
            className="rounded-xl bg-orange-500 px-5 py-3 font-semibold hover:bg-orange-600 transition"
          >
            Nuevo producto
          </Link>
        </div>

        {loading && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            Cargando productos...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900 p-10 text-center">
            <h2 className="text-2xl font-bold">No hay productos</h2>
            <p className="text-zinc-400 mt-3 text-sm">
              Crea tu primer producto para comenzar a armar el menú.
            </p>
            <Link
              href="/admin/products/create"
              className="mt-6 inline-block rounded-xl bg-orange-500 px-5 py-3 font-semibold hover:bg-orange-600 transition"
            >
              Nuevo producto
            </Link>
          </div>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <table className="w-full">
              <thead className="border-b border-zinc-800 bg-zinc-900/50">
                <tr className="text-left">
                  <th className="p-4">Producto</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4">Precio</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-zinc-800 last:border-none"
                  >
                    <td className="p-4 font-medium">
                      {product.product_name}
                    </td>

                    <td className="p-4 text-zinc-400">
                      {product.categories.category_name}
                    </td>

                    <td className="p-4">
                      ${product.product_price.toLocaleString("es-CL")}
                    </td>

                    <td className="p-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        product.status_id === 1
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {product.status_id === 1 ? "Activo" : "Oculto"}
                      </span>
                    </td>

                    <td className="p-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/products/${encodeId(product.id)}/edit`}
                          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 transition"
                        >
                          Editar
                        </Link>

                        <button
                          onClick={async () => await deleteProduct(product.id, product.product_image_public_id)}
                          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </main>
  )
}