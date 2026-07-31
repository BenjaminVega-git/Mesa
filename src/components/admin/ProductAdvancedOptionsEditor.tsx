"use client"

import type { ProductMenuOptionForm } from "@/hooks/useCreateProduct"

type Props = {
  enabled: boolean
  options: ProductMenuOptionForm[]
  disabled?: boolean
  onEnabledChange: (value: boolean) => void
  onAddOption: () => void
  onRemoveOption: (localId: string) => void
  onOptionNameChange: (localId: string, value: string) => void
  onOptionPriceChange: (localId: string, value: string) => void
}

export function ProductAdvancedOptionsEditor({
  enabled,
  options,
  disabled,
  onEnabledChange,
  onAddOption,
  onRemoveOption,
  onOptionNameChange,
  onOptionPriceChange,
}: Props) {
  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-orange-500 focus:ring-orange-300 disabled:opacity-50"
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-stone-900">Opciones avanzadas</span>
          <span className="block text-xs leading-5 text-stone-500">
            Checkboxes opcionales para el menu, como palillos, ensalada, cubiertos o salsas.
          </span>
        </span>
      </label>

      {enabled ? (
        <div className="space-y-2 border-t border-stone-200 pt-3">
          {options.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-4 text-center text-xs text-stone-500">
              Aun no hay opciones avanzadas.
            </p>
          ) : (
            options.map((option) => (
              <div
                key={option.localId}
                className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_120px_auto]"
              >
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-stone-600">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={option.name}
                    disabled={disabled}
                    placeholder="Ej: Agregar palillos"
                    onChange={(event) => onOptionNameChange(option.localId, event.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-stone-600">
                    Precio extra
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={option.extraPrice}
                    disabled={disabled}
                    placeholder="0"
                    onChange={(event) => onOptionPriceChange(option.localId, event.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-50"
                  />
                </div>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveOption(option.localId)}
                  className="self-end rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            ))
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={onAddOption}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Agregar opcion
          </button>
        </div>
      ) : null}
    </section>
  )
}
