"use client"

import Link from "next/link"
import { useState, useEffect } from "react"

import { useCategories } from "@/hooks/useCategories"
import { useDeleteCategory } from "@/hooks/useDeleteCategory"

export default function CategoriesPage() {

  const {
    categories,
    loading,
    error
  } = useCategories()

  const {
    deleteCategory
  } = useDeleteCategory()

  const [localCategories, setLocalCategories] = useState<any[]>([])

  useEffect(() => {
    setLocalCategories(categories)
  }, [categories])

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="mx-auto max-w-5xl">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-4xl font-bold">
              Categorías
            </h1>

            <p className="text-zinc-400 mt-2">
              Organiza las categorías de tu menú.
            </p>

          </div>

          <Link
            href="/admin/categories/create"
            className="rounded-xl bg-orange-500 px-5 py-3 font-semibold hover:bg-orange-600 transition"
          >
            Nueva categoría
          </Link>

        </div>

        {loading && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
            Cargando categorías...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && localCategories.length === 0 && (

          <div className="flex justify-center pt-16">

            <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center shadow-xl">

              <h2 className="text-2xl font-bold mb-3">
                No hay categorías
              </h2>

              <p className="text-zinc-400 mb-6">
                Crea tu primera categoría para comenzar a organizar tu menú.
              </p>

              <Link
                href="/admin/categories/create"
                className="inline-flex rounded-xl bg-orange-500 px-5 py-3 font-semibold hover:bg-orange-600 transition"
              >
                Crear categoría
              </Link>

            </div>

          </div>

        )}

        {!loading && !error && localCategories.length > 0 && (

          <div className="space-y-4">

            {localCategories.map((category) => (

              <div
                key={category.id}
                className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
              >

                <div>

                  <h2 className="font-semibold text-lg">
                    {category.category_name}
                  </h2>

                  <p className="text-sm text-zinc-400">
                    Categoría del menú
                  </p>

                </div>

                <div className="flex gap-3">

                  <Link
                    href={`/admin/categories/${category.id}/edit`}
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 transition"
                  >
                    Editar
                  </Link>

                  <button
                    onClick={async () => {

                      const success =
                        await deleteCategory(category.id)

                      if (success) {

                        setLocalCategories((prev) =>
                          prev.filter(
                            (c) => c.id !== category.id
                          )
                        )
                      }
                    }}
                    className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition"
                  >
                    Eliminar
                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>
    </main>
  )
}