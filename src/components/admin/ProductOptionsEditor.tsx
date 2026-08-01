"use client"

import { useEffect, useMemo, useState } from "react"
import type { ProductOptionForm } from "@/lib/validation/product"

type ProductOptionsEditorProps = {
  options: ProductOptionForm[]
  disabled?: boolean
  onAddOption: () => void
  onRemoveOption: (localId: string) => void
  onOptionNameChange: (localId: string, value: string) => void
  onOptionCodigoChange: (localId: string, value: string) => void
  onOptionDescriptionChange: (localId: string, value: string) => void
  onOptionPriceChange: (localId: string, value: string) => void
  onOptionImageChange: (localId: string, file: File | null) => void
  onOptionRemoveBgChange: (localId: string, value: boolean) => void
}

function OptionImageInput({
  option,
  disabled,
  inputId,
  onImageChange,
  onRemoveBgChange,
}: {
  option: ProductOptionForm
  disabled?: boolean
  inputId: string
  onImageChange: (file: File | null) => void
  onRemoveBgChange: (value: boolean) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const previewFile = option.processedFile ?? option.imageFile
  const previewUrl = useMemo(
    () => previewFile ? URL.createObjectURL(previewFile) : "",
    [previewFile]
  )

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const imageToShow = previewUrl || option.imageUrl

  return (
    <div className="space-y-2">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          onImageChange(event.target.files?.[0] ?? null)
          setMenuOpen(false)
        }}
      />

      {imageToShow ? (
        <div
          className="group relative aspect-video overflow-hidden rounded-xl border border-stone-200 bg-stone-100 bg-contain bg-center bg-no-repeat shadow-sm"
          style={{ backgroundImage: `url("${imageToShow}")` }}
          onMouseLeave={() => setMenuOpen(false)}
        >
          <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />

          {option.processing && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-full bg-stone-900/85 px-3 py-1 text-[10px] font-semibold text-white shadow">
                <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
                Procesando…
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => setMenuOpen((open) => !open)}
            className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-sm font-bold leading-none text-stone-700 shadow ring-1 ring-stone-200 transition group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 ${
              menuOpen ? "opacity-100" : "opacity-0"
            }`}
            aria-label="Opciones de imagen"
          >
            ...
          </button>

          {menuOpen && (
            <label
              htmlFor={inputId}
              className="absolute right-2 top-12 cursor-pointer rounded-full bg-stone-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg transition hover:bg-stone-800"
            >
              Cambiar imagen
            </label>
          )}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center transition hover:border-orange-400 hover:bg-orange-50/40"
        >
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-xl text-stone-600">
            +
          </div>
          <span className="text-xs font-semibold text-stone-800">
            Seleccionar imagen
          </span>
          <span className="mt-0.5 text-[10px] text-stone-500">
            PNG, JPG o WEBP
          </span>
        </label>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-stone-600 select-none">
        <input
          type="checkbox"
          checked={option.removeBg}
          disabled={disabled}
          onChange={(event) => onRemoveBgChange(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-stone-300 text-orange-500 focus:ring-orange-200"
        />
        Quitar fondo
        <span className="text-stone-400">(más lento)</span>
      </label>
    </div>
  )
}

export function ProductOptionsEditor({
  options,
  disabled,
  onAddOption,
  onRemoveOption,
  onOptionNameChange,
  onOptionCodigoChange,
  onOptionDescriptionChange,
  onOptionPriceChange,
  onOptionImageChange,
  onOptionRemoveBgChange,
}: ProductOptionsEditorProps) {
  const isSingleOption = options.length === 1

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-stone-900">Opciones</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            {isSingleOption ? "Producto simple" : "Variantes del producto"}
          </p>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={onAddOption}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-lg font-bold leading-none text-white shadow transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Agregar opcion"
        >
          +
        </button>
      </div>

      {isSingleOption ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Precio
            </label>
            <input
              type="number"
              placeholder="8990"
              value={options[0]?.price ?? ""}
              onChange={(event) => onOptionPriceChange(options[0].localId, event.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Codigo
            </label>
            <input
              type="text"
              placeholder="Escanea o escribe el codigo"
              value={options[0]?.codigo ?? ""}
              disabled={disabled}
              onChange={(event) => onOptionCodigoChange(options[0].localId, event.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Imagen del producto
            </label>
            <OptionImageInput
              option={options[0]}
              disabled={disabled}
              inputId={`product-option-image-${options[0].localId}`}
              onImageChange={(file) => onOptionImageChange(options[0].localId, file)}
              onRemoveBgChange={(value) => onOptionRemoveBgChange(options[0].localId, value)}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {options.map((option, index) => (
            <article
              key={option.localId}
              className="rounded-xl border border-stone-200 bg-white p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-stone-900">Opción {index + 1}</h3>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveOption(option.localId)}
                  className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[0.95fr_1fr]">
                <OptionImageInput
                  option={option}
                  disabled={disabled}
                  inputId={`product-option-image-${option.localId}`}
                  onImageChange={(file) => onOptionImageChange(option.localId, file)}
                  onRemoveBgChange={(value) => onOptionRemoveBgChange(option.localId, value)}
                />

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-stone-700">
                      Nombre
                    </label>
                    <input
                      type="text"
                      placeholder="Mediana"
                      value={option.name}
                      onChange={(event) => onOptionNameChange(option.localId, event.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-stone-700">
                      Codigo
                    </label>
                    <input
                      type="text"
                      placeholder="Escanea o escribe el codigo de esta variante"
                      value={option.codigo}
                      disabled={disabled}
                      onChange={(event) => onOptionCodigoChange(option.localId, event.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-stone-700">
                      Descripcion opcional
                    </label>
                    <textarea
                      placeholder="Ej: masa delgada, mas queso, tamano familiar..."
                      value={option.description}
                      disabled={disabled}
                      maxLength={1000}
                      onChange={(event) =>
                        onOptionDescriptionChange(option.localId, event.target.value)
                      }
                      className="min-h-[68px] w-full resize-y rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-stone-700">
                      Precio
                    </label>
                    <input
                      type="number"
                      placeholder="8990"
                      value={option.price}
                      onChange={(event) => onOptionPriceChange(option.localId, event.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
                    />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
