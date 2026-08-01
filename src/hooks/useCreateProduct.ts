import { useRef, useState } from "react"
import { useRestaurantId } from "@/hooks/useRestaurantId"
import { useUploadImage } from "@/hooks/useUploadImage"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"
import { handleMutationError } from "@/lib/hooks/handle-mutation-error"
import { createProductAction } from "@/app/actions/product-actions"
import { invalidateProductCaches } from "@/lib/cache-invalidation"
import { processImage } from "@/lib/image-processing"
import { readRemoveBgPreference, writeRemoveBgPreference } from "@/lib/preferences/remove-bg"
import {
  CreateProductOptionSchema,
  CreateProductSchema,
  type CreateProductOptionInput,
  type ProductMenuOptionInput,
  type ProductOptionForm,
} from "@/lib/validation/product"

let optionIdSeed = 0
let menuOptionIdSeed = 0

export type ProductMenuOptionForm = {
  localId: string
  name: string
  extraPrice: string
}

function createLocalOption(name = ""): ProductOptionForm {
  optionIdSeed += 1

  return {
    localId: `option-${Date.now()}-${optionIdSeed}`,
    name,
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
  }
}

function createLocalMenuOption(name = ""): ProductMenuOptionForm {
  menuOptionIdSeed += 1
  return {
    localId: `menu-option-${Date.now()}-${menuOptionIdSeed}`,
    name,
    extraPrice: "0",
  }
}

export function useCreateProduct() {
  const { restaurantId, loading: loadingId } = useRestaurantId()
  const { uploadImage, uploading } = useUploadImage()
  const successRef = useRef(false)
  // ID del producto recién creado, para flujos post-creación (ej: abrir receta).
  const createdIdRef = useRef<number | null>(null)
  // Promesa de procesamiento en curso por localId — para esperar al submit.
  const processingPromises = useRef<Map<string, Promise<File | null>>>(new Map())
  // Token por localId para descartar resultados viejos cuando el usuario cambia imagen/toggle.
  const processingTokens = useRef<Map<string, number>>(new Map())

  const [productName, setProductName] = useState("")
  const [productDescription, setProductDescription] = useState("")
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [options, setOptions] = useState<ProductOptionForm[]>([createLocalOption()])
  const [advancedOptionsEnabled, setAdvancedOptionsEnabledState] = useState(false)
  const [menuOptions, setMenuOptions] = useState<ProductMenuOptionForm[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const productPrice = options[0]?.price ?? ""
  const productImage = options[0]?.imageFile ?? null

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
        // Si falla el procesado, dejamos processedFile en null para que el upload haga fallback al original.
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

  function setOptionRemoveBg(localId: string, value: boolean) {
    writeRemoveBgPreference(value)
    updateOption(localId, { removeBg: value })
    const current = options.find((o) => o.localId === localId)
    if (!current?.imageFile) return
    startProcessing(localId, current.imageFile, value)
  }

  function addOption() {
    setOptions((currentOptions) => {
      const normalizedOptions =
        currentOptions.length === 1 && !currentOptions[0]?.name.trim()
          ? [{ ...currentOptions[0], name: "Opcion 1" }]
          : currentOptions

      return [
        ...normalizedOptions,
        createLocalOption(`Opcion ${normalizedOptions.length + 1}`)
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
      createLocalMenuOption(`Opcion ${current.length + 1}`),
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

  // Sube imágenes en paralelo y construye los options validados.
  async function prepareOptions(): Promise<CreateProductOptionInput[]> {
    const uploadResults = await Promise.all(
      options.map(async (option) => {
        if (!option.imageFile) {
          return {
            option,
            imageUrl: option.imageUrl,
            imagePublicId: option.imagePublicId,
            imageRecortada: option.imageRecortada,
          }
        }

        // Esperar al procesado en curso (si lo hay).
        const pending = processingPromises.current.get(option.localId)
        const processed = pending ? await pending : option.processedFile

        const fileToUpload = processed ?? option.imageFile

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

    const preparedOptions: CreateProductOptionInput[] = []

    for (const { option, imageUrl, imagePublicId, imageRecortada } of uploadResults) {
      const rawOption = {
        name: option.name.trim() || "Principal",
        codigo: option.codigo.trim() || null,
        description: option.description.trim() || null,
        price: Number(option.price),
        imageUrl,
        imagePublicId,
        imageRecortada,
      }

      const validation = CreateProductOptionSchema.safeParse(rawOption)

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

  const { run: createProductWithRetry, isPending } = useOfflineRetry(async () => {
    if (!restaurantId) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw { isNetworkError: true, message: "Sin conexion" }
      }
      throw new Error("No se encontro el restaurante")
    }

    // Validar el form completo en cliente antes de subir nada
    const formValidation = CreateProductSchema.safeParse({
      name: productName.trim(),
      description: productDescription.trim() || null,
      categoryId,
      restaurantId,
      // options se valida después en prepareOptions
      options: [{ name: "placeholder", price: 1, imageUrl: null, imagePublicId: null }],
      menuOptions: [],
    })

    // Solo validamos los campos top-level, no options aún (porque hay que subir imágenes primero)
    if (!formValidation.success) {
      const firstError = formValidation.error.issues.find((issue) => issue.path[0] !== "options")
      if (firstError) throw new Error(firstError.message)
    }

    // Subir imágenes + validar options
    const preparedOptions = await prepareOptions()
    const preparedMenuOptions = prepareMenuOptions()

    // Llamar al server
    const result = await createProductAction({
      name: productName.trim(),
      description: productDescription.trim() || null,
      categoryId: categoryId!,
      restaurantId,
      options: preparedOptions,
      menuOptions: preparedMenuOptions,
    })

    if (!result.ok) {
      throw new Error(result.error)
    }

    createdIdRef.current = result.data.id
    invalidateProductCaches()
    successRef.current = true
  })

  function resetForm() {
    setProductName("")
    setProductDescription("")
    setCategoryId(null)
    setOptions([createLocalOption()])
    setAdvancedOptionsEnabledState(false)
    setMenuOptions([])
    setError("")
    processingTokens.current.clear()
    processingPromises.current.clear()
  }

  // Devuelve el ID del producto creado, o null si falló.
  async function createProduct(): Promise<number | null> {
    if (loading || loadingId) return null

    successRef.current = false
    createdIdRef.current = null

    try {
      setLoading(true)
      setError("")
      await createProductWithRetry()
      if (successRef.current) resetForm()
      return successRef.current ? createdIdRef.current : null
    } catch (err: unknown) {
      handleMutationError(err, {
        logTag: "Error creando producto",
        fallback: "Error al crear producto",
        setError,
      })
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    productName,
    setProductName,
    productDescription,
    setProductDescription,
    productPrice,
    setProductPrice,
    productImage,
    setProductImage,
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
    loading: loading || uploading || isPending,
    error,
    createProduct,
  }
}
