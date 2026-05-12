"use client"

import Link from "next/link"
import { useEditCategory } from "@/hooks/useEditCategory"

export default function EditCategoryPage() {
  const {
    categoryName,
    setCategoryName,
    loading,
    saving,
    error,
    updateCategory
  } = useEditCategory()

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="mx-auto max-w-xl">

        <div className="mb-8">
          <Link
            href="/admin/categories"
            className="text-sm text-orange-500 hover:text-orange-400 transition"
          >
            ← Volver a categorías
          </Link>

          <h1 className="text-3xl font-bold mt-4">
            Editar categoría
          </h1>

          <p className="text-zinc-400 mt-2">
            Modifica la información de esta categoría.
          </p>
        </div>

        {loading && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
            Cargando categoría...
          </div>
        )}

        {!loading && (
          <form
            onSubmit={updateCategory}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-5"
          >
            <div>
              <label className="block text-sm text-zinc-300 mb-2">
                Nombre de la categoría
              </label>

              <input
                type="text"
                required
                disabled={saving}
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 outline-none focus:border-orange-500 disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Link
                href="/admin/categories"
                className="rounded-xl border border-zinc-700 px-5 py-3 font-semibold hover:bg-zinc-800 transition"
              >
                Cancelar
              </Link>

              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-orange-500 px-5 py-3 font-semibold hover:bg-orange-600 transition disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        )}

      </div>
    </main>
  )
}