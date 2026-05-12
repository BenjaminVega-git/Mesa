"use client"

import Link from "next/link"
import { encodeId } from "@/lib/hashids" 
import { useCategoryList } from "@/hooks/useCategoryList"

export default function CategoriesPage() {
  const {
    categories,
    totalCategories,
    loading,
    error,
    deleteCategory
  } = useCategoryList()

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-5 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="mb-4 inline-flex rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-600 hover:shadow-md"
            >
              Volver
            </Link>

            <p className="text-sm text-stone-600">Panel admin</p>
            <h1 className="text-3xl font-bold tracking-tight">Categorías</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">
              Organiza las secciones de tu menú para mantener la carta clara.
            </p>
          </div>

          <Link
            href="/admin/categories/create"
            aria-label="Crear categoría"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500 text-3xl font-semibold leading-none text-white shadow-xl shadow-orange-500/25 transition hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-orange-500/35"
          >
            +
          </Link>
        </header>

        <section className="rounded-4xl border border-stone-200 bg-white p-4 shadow-xl shadow-stone-900/5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4 rounded-3xl bg-stone-50 px-5 py-4 ring-1 ring-stone-200">
            <div>
              <p className="text-sm text-stone-600">Categorías registradas</p>
              <p className="mt-1 text-4xl font-bold leading-none tracking-tight">
                {totalCategories}
              </p>
            </div>

         
          </div>

          {loading && (
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-6 text-sm text-stone-600 shadow-inner">
              Cargando categorías...
            </div>
          )}

          {error && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-600 shadow-sm">
              {error}
            </div>
          )}

          {!loading && !error && categories.length === 0 && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center shadow-inner">
              <h2 className="text-2xl font-bold tracking-tight">
                No hay categorías
              </h2>

              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-600">
                Crea tu primera categoría para comenzar a organizar el menú de tu restaurante.
              </p>

              <Link
                href="/admin/categories/create"
                aria-label="Crear primera categoría"
                className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-3xl font-semibold leading-none text-white shadow-xl shadow-orange-500/25 transition hover:-translate-y-0.5 hover:bg-orange-600"
              >
                +
              </Link>
            </div>
          )}

          {!loading && !error && categories.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {categories.map((category) => (
                <article
                  key={category.id}
                  className="rounded-3xl border border-stone-200 bg-white p-5 shadow-lg shadow-stone-900/5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-stone-900/10"
                >
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-lg font-bold text-orange-700">
                      {category.category_name.slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-stone-950">
                        {category.category_name}
                      </h2>

                      <p className="mt-1 text-sm text-stone-600">
                        Categoría del menú
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                     href={`/admin/categories/${encodeId(category.id)}/edit`}
                      className="flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-center text-sm font-semibold text-stone-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                    >
                      Editar
                    </Link>

                    <button
                      onClick={async () => {
                        await deleteCategory(category.id)
                      }}
                      className="flex-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
