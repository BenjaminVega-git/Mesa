"use client"

import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { ProductOptionsEditor } from "@/components/admin/ProductOptionsEditor"
import { ProductAdvancedOptionsEditor } from "@/components/admin/ProductAdvancedOptionsEditor"
import { ProductRecipeEditor } from "@/components/admin/ProductRecipeEditor"
import { useEditProduct } from "@/hooks/useEditProduct"
import { useAllCategories } from "@/hooks/useAllCategories"

type Tab = "datos" | "receta"

type Props = {
  open: boolean
  productId: number | null
  onClose: () => void
  onSaved: () => void
  // Pestaña en la que abrir el diálogo (default "datos").
  initialTab?: Tab
  // Si es true, la pestaña Receta dispara la sugerencia con IA automáticamente.
  autoSuggestAI?: boolean
}

export function EditProductDialog({
  open,
  productId,
  onClose,
  onSaved,
  initialTab = "datos",
  autoSuggestAI = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("datos")
  // Para que la IA solo se auto-dispare una vez, no al revisitar la pestaña.
  const [autoConsumed, setAutoConsumed] = useState(false)

  // Al abrir o cambiar de producto, posicionar en la pestaña indicada.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al abrir el modal
      setTab(initialTab)
      setAutoConsumed(false)
    }
  }, [open, productId, initialTab])

  const {
    productName, setProductName,
    productDescription, setProductDescription,
    categoryId, setCategoryId,
    options,
    advancedOptionsEnabled,
    setAdvancedOptionsEnabled,
    menuOptions,
    addMenuOption,
    removeMenuOption,
    setMenuOptionName,
    setMenuOptionPrice,
    setOptionName,
    setOptionCodigo,
    setOptionDescription,
    setOptionPrice,
    setOptionImage,
    setOptionRemoveBg,
    addOption,
    removeOption,
    loading, saving,
    loadError, error,
    updateProduct,
  } = useEditProduct(open ? productId : null)

  const { categories } = useAllCategories()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const ok = await updateProduct()
    if (ok) {
      onSaved()
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={saving}
      size="lg"
      title="Editar producto"
      description="Modifica los datos, precios o variantes del producto."
    >
      <div className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1">
        {(["datos", "receta"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              tab === t ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
            }`}
          >
            {t === "datos" ? "Datos" : "Receta e inventario"}
          </button>
        ))}
      </div>

      {tab === "receta" ? (
        productId ? (
          <ProductRecipeEditor
            productId={productId}
            autoSuggestAI={autoSuggestAI && !autoConsumed}
            onAutoSuggested={() => setAutoConsumed(true)}
          />
        ) : null
      ) : loading ? (
        <p className="py-6 text-center text-sm text-stone-500">Cargando producto...</p>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Nombre del producto
            </label>
            <input
              type="text"
              required
              disabled={saving}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Descripción
            </label>
            <textarea
              disabled={saving}
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              className="min-h-[80px] w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Categoría
            </label>
            <select
              required
              disabled={saving}
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(Number(e.target.value) || null)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
            >
              <option value="">Selecciona una categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.category_name}
                </option>
              ))}
            </select>
          </div>

          <ProductOptionsEditor
            options={options}
            disabled={saving}
            onAddOption={addOption}
            onRemoveOption={removeOption}
            onOptionNameChange={setOptionName}
            onOptionCodigoChange={setOptionCodigo}
            onOptionDescriptionChange={setOptionDescription}
            onOptionPriceChange={setOptionPrice}
            onOptionImageChange={setOptionImage}
            onOptionRemoveBgChange={setOptionRemoveBg}
          />

          <ProductAdvancedOptionsEditor
            enabled={advancedOptionsEnabled}
            options={menuOptions}
            disabled={saving}
            onEnabledChange={setAdvancedOptionsEnabled}
            onAddOption={addMenuOption}
            onRemoveOption={removeMenuOption}
            onOptionNameChange={setMenuOptionName}
            onOptionPriceChange={setMenuOptionPrice}
          />

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
