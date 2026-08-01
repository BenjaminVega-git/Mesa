import { useEffect, useRef, useState } from "react"
import { useUploadImage } from "@/hooks/useUploadImage"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"
import { handleMutationError } from "@/lib/hooks/handle-mutation-error"
import {
  compressInBrowser,
  processImage,
  removeBackgroundFromUrlRequest,
} from "@/lib/image-processing"
import { readRemoveBgPreference, writeRemoveBgPreference } from "@/lib/preferences/remove-bg"
import {
  updateProductAction,
  getProductForEditAction,
} from "@/app/actions/product-actions"
import { invalidateProductCaches } from "@/lib/cache-invalidation"
import {
  UpdateProductOptionSchema,
  UpdateProductSchema,
  type UpdateProductOptionInput,
  type ProductMenuOptionInput,
  type ProductOptionForm,
} from "@/lib/validation/product"
import type { ProductMenuOptionForm } from "@/hooks/useCreateProduct"

let optionIdSeed = 0
let menuOptionIdSeed = 0

function createLocalOption(values?: Partial<ProductOptionForm>): ProductOptionForm {
  optionIdSeed += 1

  return {
    localId: `option-${Date.now()}-${optionIdSeed}`,
    name: "",
    codigo: "",
    description: "",
    price: "",
    imageFile: null,
    processedFile: null,
    processing: false,
    removeBg: readRemoveBgPreference(),
    imageUrl: null,
    imagePublicId: null,
    imageRecortada: false,
    ...values,
  }
}

function createLocalMenuOption(values?: Partial<ProductMenuOptionForm>): ProductMenuOptionForm {
  menuOptionIdSeed += 1
  return {
    localId: `menu-option-${Date.now()}-${menuOptionIdSeed}`,
    name: "",
    extraPrice: "0",
    ...values,
  }
}

export function useEditProduct(productId: number | null) {
  const { uploadImage, uploading } = useUploadImage()
  const successRef = useRef(false)
  const processingPromises = useRef<Map<string, Promise<File | null>>>(new Map())
  const processingTokens = useRef<Map<string, number>>(new Map())
  // localIds cuya imagen local fue descargada desde una URL existente (para poder revertir al apagar "quitar fondo").
  const derivedFromUrlRef = useRef<Set<string>>(new Set())

  const [productName, setProductName] = useState("")
  const [productDescription, setProductDescription] = useState("")
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [options, setOptions] = useState<ProductOptionForm[]>([createLocalOption()])
  const [advancedOptionsEnabled, setAdvancedOptionsEnabledState] = useState(false)
  const [menuOptions, setMenuOptions] = useState<ProductMenuOptionForm[]>([])
  const [initialVariantIds, setInitialVariantIds] = useState<number[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [error, setError] = useState("")

  const productPrice = options[0]?.price ?? ""
  const productImage = options[0]?.imageFile ?? null
  const currentImageUrl = options[0]?.imageUrl ?? null

  // ============ CARGAR PRODUCTO ============

  const { run: loadProductWithRetry, isPending: isLoadPending } = useOfflineRetry(async () => {
    if (!productId) throw new Error("Producto no encontrado")

    const result = await getProductForEditAction(productId)

    if (!result.ok) {
      throw new Error(result.error)
    }

    const product = result.data

    setProductName(product.name)
    setProductDescription(product.description ?? "")
    setCategoryId(product.categoryId)
    setInitialVariantIds(product.variants.map((variant) => variant.id))
    setAdvancedOptionsEnabledState(product.menuOptions.length > 0)
    setMenuOptions(
      product.menuOptions.map((option) =>
        createLocalMenuOption({
          localId: `menu-option-existing-${option.id}`,
          name: option.name,
          extraPrice: String(option.extraPrice),
        })
      )
    )

    if (product.variants.length > 0) {
      setOptions(
        product.variants.map((variant) =>
          createLocalOption({
            variantId: variant.id,
            name: variant.name,
            codigo: variant.codigo ?? "",
            description: variant.description ?? "",
            price: String(variant.price),
            imageUrl: variant.imageUrl,
            imagePublicId: variant.imagePublicId,
            imageRecortada: product.fallbackImageRecortada,
          })
        )
      )
    } else {
      setOptions([
        createLocalOption({
          name: "Principal",
          codigo: product.codigo ?? "",
          price: String(product.fallbackPrice),
          imageUrl: product.fallbackImageUrl,
          imagePublicId: product.fallbackImagePublicId,
          imageRecortada: product.fallbackImageRecortada,
        }),
      ])
    }

    setLoadError("")
  })

  useEffect(() => {
    if (!productId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- modal cerrado: no hay id, salimos del estado de carga inicial.
      setLoading(false)
      return
    }

    let cancelled = false
    async function loadProduct() {
      try {
        setLoading(true)
        setLoadError("")
        await loadProductWithRetry()
      } catch (err: unknown) {
        if (cancelled) return
        handleMutationError(err, {
          logTag: "Error cargando producto",
          fallback: "Error al cargar producto",
          setError: setLoadError,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProduct()
    return () => { cancelled = true }
  }, [productId, loadProductWithRetry])

  // ============ FORM HELPERS ============

  function updateOption(localId: string, patch: Partial<ProductOptionForm>) {
    setOptions((currentOptions) =>
      currentOptions.map((option) =>
        option.localId === localId ? { ...option, ...patch } : option
      )
    )
  }

  function startProcessing(localId: string, file: File, removeBg: boolean) {
    const nextToken = (processingTokens.current.get(localId) ?? 0) + 1
    processingTokens.current.set(localId, nextToken)

    updateOption(localId, { processing: true, processedFile: null })

    const promise = processImage(file, { removeBg })
      .then((result) => {
        if (processingTokens.current.get(localId) !== nextToken) return null
        updateOption(localId, { processedFile: result, processing: false })
        return result
      })
      .catch(() => {
        if (processingTokens.current.get(localId) !== nextToken) return null
        updateOption(localId, { processing: false })
        return null
      })

    processingPromises.current.set(localId, promise)
  }

  function setProductPrice(value: string) {
    const firstOption = options[0]
    if (!firstOption) return
    updateOption(firstOption.localId, { price: value })
  }

  function setProductImage(file: File | null) {
    const firstOption = options[0]
    if (!firstOption) return
    setOptionImage(firstOption.localId, file)
  }

  function setOptionName(localId: string, value: string) {
    updateOption(localId, { name: value })
  }

  function setOptionCodigo(localId: string, value: string) {
    updateOption(localId, { codigo: value })
  }

  function setOptionDescription(localId: string, value: string) {
    updateOption(localId, { description: value })
  }

  function setOptionPrice(localId: string, value: string) {
    updateOption(localId, { price: value })
  }

  function setOptionImage(localId: string, file: File | null) {
    // Cambio explícito del usuario: ya no es una imagen derivada de la URL existente.
    derivedFromUrlRef.current.delete(localId)
    updateOption(localId, { imageFile: file, processedFile: null })
    if (!file) {
      processingTokens.current.set(localId, (processingTokens.current.get(localId) ?? 0) + 1)
      processingPromises.current.delete(localId)
      updateOption(localId, { processing: false })
      return
    }
    const current = options.find((o) => o.localId === localId)
    startProcessing(localId, file, current?.removeBg ?? false)
  }

  // Edición sin archivo nuevo: descarga la imagen actual desde su URL, la convierte en File
  // y la procesa (quitar fondo + comprimir) para resubirla al guardar.
  function startProcessingFromUrl(localId: string, url: string, removeBg: boolean) {
    const nextToken = (processingTokens.current.get(localId) ?? 0) + 1
    processingTokens.current.set(localId, nextToken)

    updateOption(localId, { processing: true, processedFile: null })

    const promise = (async () => {
      const processedWithBgRemoved = removeBg
        ? await removeBackgroundFromUrlRequest(url)
        : null
      if (!processedWithBgRemoved) throw new Error("No se pudo quitar el fondo")

      const processed = await compressInBrowser(processedWithBgRemoved)
      if (processingTokens.current.get(localId) !== nextToken) return null
      // Fijar un archivo local para que prepareOptions suba y guarde la nueva imagen.
      updateOption(localId, { imageFile: processed, processedFile: processed, processing: false })
      return processed
    })().catch(() => {
      if (processingTokens.current.get(localId) !== nextToken) return null
      derivedFromUrlRef.current.delete(localId)
      updateOption(localId, { processing: false })
      setError("No se pudo quitar el fondo de la imagen actual. Intenta cambiando la imagen o revisa tu cuota de remove.bg.")
      return null
    })

    processingPromises.current.set(localId, promise)
  }

  function setOptionRemoveBg(localId: string, value: boolean) {
    writeRemoveBgPreference(value)
    updateOption(localId, { removeBg: value })

    const current = options.find((o) => o.localId === localId)
    if (!current) return

    if (current.imageFile) {
      // Si se apaga y el archivo venía de una URL existente, revertir a la imagen original sin resubir.
      if (!value && derivedFromUrlRef.current.has(localId)) {
        derivedFromUrlRef.current.delete(localId)
        processingTokens.current.set(localId, (processingTokens.current.get(localId) ?? 0) + 1)
        processingPromises.current.delete(localId)
        updateOption(localId, { imageFile: null, processedFile: null, processing: false })
        return
      }
      startProcessing(localId, current.imageFile, value)
      return
    }

    // No hay archivo local pero sí una imagen ya guardada: solo tiene sentido al activar.
    if (value && current.imageUrl) {
      derivedFromUrlRef.current.add(localId)
      startProcessingFromUrl(localId, current.imageUrl, value)
    }
  }

  function addOption() {
    setOptions((currentOptions) => {
      const normalizedOptions =
        currentOptions.length === 1 && !currentOptions[0]?.name.trim()
          ? [{ ...currentOptions[0], name: "Opcion 1" }]
          : currentOptions

      return [
        ...normalizedOptions,
        createLocalOption({ name: `Opcion ${normalizedOptions.length + 1}` }),
      ]
    })
  }

  function removeOption(localId: string) {
    setOptions((currentOptions) => {
      if (currentOptions.length === 1) return currentOptions
      return currentOptions.filter((option) => option.localId !== localId)
    })
    processingTokens.current.delete(localId)
    processingPromises.current.delete(localId)
  }

  function setAdvancedOptionsEnabled(value: boolean) {
    setAdvancedOptionsEnabledState(value)
    setMenuOptions((current) => {
      if (!value) return []
      return current.length > 0 ? current : [createLocalMenuOption()]
    })
  }

  function addMenuOption() {
    setAdvancedOptionsEnabledState(true)
    setMenuOptions((current) => [
      ...current,
      createLocalMenuOption({ name: `Opcion ${current.length + 1}` }),
    ])
  }

  function removeMenuOption(localId: string) {
    setMenuOptions((current) => current.filter((option) => option.localId !== localId))
  }

  function setMenuOptionName(localId: string, value: string) {
    setMenuOptions((current) =>
      current.map((option) => option.localId === localId ? { ...option, name: value } : option)
    )
  }

  function setMenuOptionPrice(localId: string, value: string) {
    setMenuOptions((current) =>
      current.map((option) =>
        option.localId === localId ? { ...option, extraPrice: value } : option
      )
    )
  }

  // ============ PREPARAR OPCIONES (subir imágenes en paralelo + validar) ============

  async function prepareOptions(): Promise<UpdateProductOptionInput[]> {
    const uploadResults = await Promise.all(
      options.map(async (option) => {
        const pending = processingPromises.current.get(option.localId)

        // Sin archivo local ni procesado en curso: conservar la imagen existente.
        if (!option.imageFile && !pending) {
          return {
            option,
            imageUrl: option.imageUrl,
            imagePublicId: option.imagePublicId,
            imageRecortada: option.imageRecortada,
          }
        }

        const processed = pending ? await pending : option.processedFile

        const fileToUpload = processed ?? option.imageFile

        // El procesado/descarga falló y no hay archivo local: conservar la imagen existente.
        if (!fileToUpload) {
          return {
            option,
            imageUrl: option.imageUrl,
            imagePublicId: option.imagePublicId,
            imageRecortada: option.imageRecortada,
          }
        }

        const result = await uploadImage(
          fileToUpload,
          process.env.NEXT_PUBLIC_CLOUDINARY_PRODUCTS_PRESET!,
          { alreadyProcessed: true }
        )

        if (!result) throw new Error("Error al subir imagen")

        return {
          option,
          imageUrl: result.secure_url,
          imagePublicId: result.public_id,
          // Imagen nueva: el flag lo determina el toggle "quitar fondo".
          imageRecortada: option.removeBg,
        }
      })
    )

    const preparedOptions: UpdateProductOptionInput[] = []

    for (const { option, imageUrl, imagePublicId, imageRecortada } of uploadResults) {
      const rawOption = {
        ...(option.variantId ? { variantId: option.variantId } : {}),
        name: option.name.trim() || "Principal",
        codigo: option.codigo.trim() || null,
        description: option.description.trim() || null,
        price: Number(option.price),
        imageUrl,
        imagePublicId,
        imageRecortada,
      }

      const validation = UpdateProductOptionSchema.safeParse(rawOption)

      if (!validation.success) {
        throw new Error(validation.error.issues[0]?.message ?? "Datos inválidos")
      }

      preparedOptions.push(validation.data)
    }

    return preparedOptions
  }

  function prepareMenuOptions(): ProductMenuOptionInput[] {
    if (!advancedOptionsEnabled) return []
    return menuOptions
      .map((option) => ({
        name: option.name.trim(),
        extraPrice: Number(option.extraPrice || 0),
      }))
      .filter((option) => option.name.length > 0)
  }

  // ============ ACTUALIZAR ============

  const { run: updateProductWithRetry, isPending } = useOfflineRetry(async () => {
    if (!productId) throw new Error("Producto no encontrado")

    // Validar form básico antes de subir imágenes
    const basicValidation = UpdateProductSchema.safeParse({
      productId,
      name: productName.trim(),
      description: productDescription.trim() || null,
      categoryId,
      options: [{ name: "placeholder", price: 1, imageUrl: null, imagePublicId: null }],
      initialVariantIds,
      menuOptions: [],
    })

    if (!basicValidation.success) {
      const firstError = basicValidation.error.issues.find((issue) => issue.path[0] !== "options")
      if (firstError) throw new Error(firstError.message)
    }

    // Subir imágenes + validar options
    const preparedOptions = await prepareOptions()
    const preparedMenuOptions = prepareMenuOptions()

    // Llamar al server
    const result = await updateProductAction({
      productId,
      name: productName.trim(),
      description: productDescription.trim() || null,
      categoryId: categoryId!,
      options: preparedOptions,
      initialVariantIds,
      menuOptions: preparedMenuOptions,
    })

    if (!result.ok) {
      throw new Error(result.error)
    }

    invalidateProductCaches()
    successRef.current = true
  })

  async function updateProduct(): Promise<boolean> {
    if (saving) return false

    successRef.current = false

    try {
      setSaving(true)
      setError("")
      await updateProductWithRetry()
      return successRef.current
    } catch (err: unknown) {
      handleMutationError(err, {
        logTag: "Error actualizando producto",
        fallback: "Error al guardar cambios",
        setError,
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  return {
    productId,
    productName,
    setProductName,
    productDescription,
    setProductDescription,
    productPrice,
    setProductPrice,
    productImage,
    setProductImage,
    currentImageUrl,
    categoryId,
    setCategoryId,
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
    loading: loading || isLoadPending,
    saving: saving || uploading || isPending,
    loadError,
    error,
    updateProduct,
  }
}
