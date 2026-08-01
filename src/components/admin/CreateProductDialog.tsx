"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import { ProductOptionsEditor } from "@/components/admin/ProductOptionsEditor"
import { ProductAdvancedOptionsEditor } from "@/components/admin/ProductAdvancedOptionsEditor"
import { useCreateProduct } from "@/hooks/useCreateProduct"
import { useAllCategories } from "@/hooks/useAllCategories"

type Props = {
  open: boolean
  onClose: () => void
  // Recibe el ID del producto creado, si quiere configurar receta y si pidió IA.
  onCreated: (productId: number, configureStock: boolean, useAi: boolean) => void
}

export function CreateProductDialog({ open, onClose, onCreated }: Props) {
  const [configureStock, setConfigureStock] = useState(false)
  const [useAi, setUseAi] = useState(false)

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
    loading, error,
    createProduct,
  } = useCreateProduct()

  const { categories } = useAllCategories()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    const newId = await createProduct()
    if (newId) {
      onCreated(newId, configureStock, configureStock && useAi)
      setConfigureStock(false)
      setUseAi(false)
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={loading}
      size="lg"
      title="Nuevo producto"
      description="Agrega un producto al menú con uno o varios precios/opciones."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-700">
            Nombre del producto
          </label>
          <input
            type="text"
            required
            disabled={loading}
            placeholder="Hamburguesa BBQ"
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
            disabled={loading}
            placeholder="Hamburguesa con queso cheddar, tocino y salsa BBQ..."
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
            disabled={loading}
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
          disabled={loading}
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
          disabled={loading}
          onEnabledChange={setAdvancedOptionsEnabled}
          onAddOption={addMenuOption}
          onRemoveOption={removeMenuOption}
          onOptionNameChange={setMenuOptionName}
          onOptionPriceChange={setMenuOptionPrice}
        />

        <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={configureStock}
              disabled={loading}
              onChange={(e) => setConfigureStock(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-orange-500 focus:ring-orange-300 disabled:opacity-50"
            />
            <span>
              <span className="block text-xs font-semibold text-stone-800">
                Configurar receta de stock al crear
              </span>
              <span className="block text-[11px] text-stone-500">
                Al guardar, abriremos la receta para asignar los insumos que descuenta este producto.
              </span>
            </span>
          </label>

          {configureStock && (
            <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 border-t border-stone-200 pt-2.5">
              <input
                type="checkbox"
                checked={useAi}
                disabled={loading}
                onChange={(e) => setUseAi(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-violet-500 focus:ring-violet-300 disabled:opacity-50"
              />
              <span>
                <span className="flex items-center gap-1 text-xs font-semibold text-violet-700">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Generar receta con IA
                </span>
                <span className="block text-[11px] text-stone-500">
                  Gemini propondrá los insumos del producto. Podrás revisarlos antes de guardar.
                </span>
              </span>
            </label>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creando..." : "Crear producto"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
