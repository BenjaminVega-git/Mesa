"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Pagination } from "@/components/ui/Pagination"
import { useProductList } from "@/hooks/useProductList"
import { CreateProductDialog } from "@/components/admin/CreateProductDialog"
import { EditProductDialog } from "@/components/admin/EditProductDialog"
import { BulkRecipeDialog } from "@/components/admin/BulkRecipeDialog"

const statusLabels: Record<number, string> = {
  1: "Disponible",
  2: "Agotado",
  3: "Deshabilitado",
}

const statusBadgeClasses: Record<number, string> = {
  1: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10",
  2: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
  3: "bg-stone-100 text-stone-600 ring-1 ring-stone-600/10",
}

function getStatusLabel(statusId: number, statusName?: string) {
  return statusName || statusLabels[statusId] || "Estado desconocido"
}

function getStatusActions(statusId: number) {
  if (statusId === 3) {
    return [
      { label: "Marcar como habilitado", nextStatusId: 1 },
    ]
  }

  if (statusId === 2) {
    return [
      { label: "Marcar como deshabilitado", nextStatusId: 3 },
      { label: "Marcar con stock", nextStatusId: 1 },
    ]
  }

  return [
    { label: "Marcar como deshabilitado", nextStatusId: 3 },
    { label: "Marcar como fuera de stock", nextStatusId: 2 },
  ]
}

export default function ProductsPage() {
  const [currentPage, setCurrentPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editInitialTab, setEditInitialTab] = useState<"datos" | "receta">("datos")
  const [editAutoAI, setEditAutoAI] = useState(false)
  const [showBulkRecipe, setShowBulkRecipe] = useState(false)
  const {
    products,
    totalProducts,
    totalPages,
    loading,
    deleting,
    updatingStatusId,
    error,
    deleteProduct,
    updateProductStatus,
    deleteDialog,
    refresh,
  } = useProductList({ page: currentPage, pageSize: 12 })
  const [openMenuProductId, setOpenMenuProductId] = useState<number | null>(null)

  useEffect(() => {
    if (!loading && currentPage > totalPages) {
      queueMicrotask(() => setCurrentPage(totalPages))
    }
  }, [currentPage, totalPages, loading])

  return (
    <div className="space-y-6">
      {deleteDialog}

      <CreateProductDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(newId, configureStock, useAi) => {
          refresh()
          if (configureStock) {
            // Abrir el producto recién creado directo en su pestaña de receta.
            setEditInitialTab("receta")
            setEditAutoAI(useAi)
            setEditingId(newId)
          }
        }}
      />
      <EditProductDialog
        open={editingId !== null}
        productId={editingId}
        initialTab={editInitialTab}
        autoSuggestAI={editAutoAI}
        onClose={() => {
          setEditingId(null)
          setEditInitialTab("datos")
          setEditAutoAI(false)
        }}
        onSaved={refresh}
      />
      <BulkRecipeDialog open={showBulkRecipe} onClose={() => setShowBulkRecipe(false)} />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">Carta y Productos</h2>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-700 ring-1 ring-stone-200">
              {totalProducts}
            </span>
          </div>
          <p className="text-sm text-stone-600">
            Administra los platos, tragos, precios y categorías del menú digital.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/products/import"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Importar carta
          </Link>
          <button
            type="button"
            onClick={() => setShowBulkRecipe(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-100"
          >
            <span>✨ Generar recetas</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            aria-label="Crear producto"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-orange-500/35"
          >
            <span>+ Agregar Producto</span>
          </button>
        </div>
      </div>

      {/* Panel Principal de Productos */}
      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl bg-stone-50 px-5 py-3.5 ring-1 ring-stone-200">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Productos Registrados</p>
            <p className="mt-0.5 text-2xl font-extrabold leading-none tracking-tight text-stone-900">
              {totalProducts}
            </p>
          </div>

          <div className="rounded-xl bg-orange-50 px-3 py-2 text-right ring-1 ring-orange-200/50">
            <p className="text-xs font-bold text-orange-700">Imágenes menú</p>
            <p className="text-[10px] text-stone-550">Habilitadas</p>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center text-xs font-semibold text-stone-500 animate-pulse">
            Cargando carta de productos...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-xs font-bold text-red-650 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center shadow-inner">
            <h3 className="font-bold text-stone-900">No hay productos en el menú</h3>
            <p className="mx-auto mt-2 max-w-xs text-xs text-stone-550 leading-relaxed">
              Crea tu primer producto para comenzar a armar el menú digital de tu restaurante.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600"
            >
              + Crear primer producto
            </button>
          </div>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="group relative flex min-w-0 flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-orange-250 hover:shadow-md"
                >
                  <div className="absolute right-6 top-6 z-10">
                    <button
                      type="button"
                      disabled={updatingStatusId === product.id}
                      onClick={() => {
                        setOpenMenuProductId((currentId) =>
                          currentId === product.id ? null : product.id
                        )
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-sm font-bold leading-none text-stone-700 shadow ring-1 ring-stone-200 backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 ${
                        openMenuProductId === product.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                      }`}
                      aria-label="Opciones de producto"
                    >
                      ...
                    </button>

                    {openMenuProductId === product.id && (
                      <div className="absolute right-0 top-10 w-48 overflow-hidden rounded-xl border border-stone-200 bg-white py-1.5 text-xs font-semibold text-stone-700 shadow-xl shadow-stone-900/10">
                        {getStatusActions(product.status_id).map((action) => (
                          <button
                            key={action.nextStatusId}
                            type="button"
                            disabled={updatingStatusId === product.id}
                            onClick={async () => {
                              const success = await updateProductStatus(product.id, action.nextStatusId)
                              if (success) setOpenMenuProductId(null)
                            }}
                            className="block w-full px-4 py-2 text-left transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-stone-50 ring-1 ring-stone-150">
                    {product.product_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.product_image}
                        alt={product.product_name}
                        className="h-full max-h-32 w-full object-contain p-2"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-stone-400">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg shadow-sm">
                          📷
                        </div>
                        <p className="mt-2 text-[10px] font-semibold">
                          Sin imagen
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex min-w-0 flex-1 flex-col">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-stone-900">
                          {product.product_name}
                        </h3>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-stone-550">
                          {product.categories.category_name}
                        </p>
                      </div>

                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        statusBadgeClasses[product.status_id] ?? "bg-stone-100 text-stone-600"
                      }`}>
                        {getStatusLabel(product.status_id, product.product_status?.status_name)}
                      </span>
                    </div>

                    {product.product_description && (
                      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-stone-600">
                        {product.product_description}
                      </p>
                    )}

                    <div className="mb-4 rounded-2xl bg-stone-50 px-4 py-2.5 ring-1 ring-stone-200">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Precio</p>
                      <p className="mt-0.5 text-xl font-extrabold tracking-tight text-stone-900 tabular-nums">
                        ${product.product_price.toLocaleString("es-CL")}
                      </p>
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(product.id)}
                        className="min-w-0 rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-center text-xs font-bold text-stone-750 transition hover:bg-stone-100"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        disabled={deleting}
                        onClick={async () => {
                          await deleteProduct(product.id)
                        }}
                        className="min-w-0 rounded-xl border border-red-250 bg-red-50 py-2.5 text-center text-xs font-bold text-red-650 transition hover:bg-red-100/50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              disabled={loading || deleting}
            />
          </>
        )}
      </section>
    </div>
  )
}
