import { z } from "zod"

const NAME_MAX = 120
const DESCRIPTION_MAX = 1000
const PRICE_MAX = 9_999_999
const OPTIONS_MAX = 30
const MENU_OPTIONS_MAX = 20
const PUBLIC_ID_MAX = 200
const SCAN_CODE_MAX = 80

const CLOUDINARY_PUBLIC_ID_REGEX = /^[a-zA-Z0-9_\-/.]+$/

const PriceSchema = z
  .number()
  .int("El precio debe ser un numero entero")
  .positive("El precio debe ser mayor a 0")
  .max(PRICE_MAX, "El precio es demasiado alto")

const PublicIdSchema = z
  .string()
  .trim()
  .max(PUBLIC_ID_MAX, "public_id demasiado largo")
  .regex(CLOUDINARY_PUBLIC_ID_REGEX, "public_id invalido")
  .nullable()

const ImageUrlSchema = z
  .string()
  .url("URL de imagen invalida")
  .startsWith("https://", "La imagen debe servirse por https")
  .max(500, "URL demasiado larga")
  .nullable()

export const CreateProductOptionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la opcion es obligatorio")
    .max(NAME_MAX, "El nombre de la opcion es demasiado largo"),
  codigo: z
    .string()
    .trim()
    .max(SCAN_CODE_MAX, "El codigo es demasiado largo")
    .nullable()
    .optional(),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, "La descripcion de la opcion es demasiado larga")
    .nullable()
    .optional(),
  price: PriceSchema,
  imageUrl: ImageUrlSchema,
  imagePublicId: PublicIdSchema,
  imageRecortada: z.boolean().default(false),
})

export type CreateProductOptionInput = z.infer<typeof CreateProductOptionSchema>

export const ProductMenuOptionSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la opcion avanzada es obligatorio")
    .max(NAME_MAX, "El nombre de la opcion avanzada es demasiado largo"),
  extraPrice: z
    .number()
    .int("El precio de la opcion avanzada debe ser un numero entero")
    .min(0, "El precio de la opcion avanzada no puede ser negativo")
    .max(PRICE_MAX, "El precio de la opcion avanzada es demasiado alto"),
})

export type ProductMenuOptionInput = z.infer<typeof ProductMenuOptionSchema>

export const CreateProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre del producto es obligatorio")
    .max(NAME_MAX, "El nombre del producto es demasiado largo"),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, "La descripcion es demasiado larga")
    .nullable(),
  categoryId: z.number().int().positive("Debes seleccionar una categoria"),
  restaurantId: z.number().int().positive(),
  options: z
    .array(CreateProductOptionSchema)
    .min(1, "Debe haber al menos una opcion")
    .max(OPTIONS_MAX, `Maximo ${OPTIONS_MAX} opciones por producto`),
  menuOptions: z.array(ProductMenuOptionSchema).max(MENU_OPTIONS_MAX).default([]),
})

export type CreateProductInput = z.infer<typeof CreateProductSchema>

export const UpdateProductOptionSchema = z.object({
  variantId: z.number().int().positive().optional(),
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la opcion es obligatorio")
    .max(NAME_MAX, "El nombre de la opcion es demasiado largo"),
  codigo: z
    .string()
    .trim()
    .max(SCAN_CODE_MAX, "El codigo es demasiado largo")
    .nullable()
    .optional(),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, "La descripcion de la opcion es demasiado larga")
    .nullable()
    .optional(),
  price: PriceSchema,
  imageUrl: ImageUrlSchema,
  imagePublicId: PublicIdSchema,
  imageRecortada: z.boolean().default(false),
})

export type UpdateProductOptionInput = z.infer<typeof UpdateProductOptionSchema>

export type ProductOptionForm = {
  localId: string
  variantId?: number
  name: string
  codigo: string
  description: string
  price: string
  imageFile: File | null
  processedFile: File | null
  processing: boolean
  removeBg: boolean
  imageUrl: string | null
  imagePublicId: string | null
  imageRecortada: boolean
}

export const UpdateProductSchema = z.object({
  productId: z.number().int().positive(),
  name: z
    .string()
    .trim()
    .min(1, "El nombre del producto es obligatorio")
    .max(NAME_MAX, "El nombre del producto es demasiado largo"),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, "La descripcion es demasiado larga")
    .nullable(),
  categoryId: z.number().int().positive("Debes seleccionar una categoria"),
  options: z
    .array(UpdateProductOptionSchema)
    .min(1, "Debe haber al menos una opcion")
    .max(OPTIONS_MAX, `Maximo ${OPTIONS_MAX} opciones por producto`),
  initialVariantIds: z.array(z.number().int().positive()),
  menuOptions: z.array(ProductMenuOptionSchema).max(MENU_OPTIONS_MAX).default([]),
})

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>

export const DeleteProductSchema = z.object({
  productId: z.number().int().positive(),
})

export type DeleteProductInput = z.infer<typeof DeleteProductSchema>

export const UpdateProductStatusSchema = z.object({
  productId: z.number().int().positive(),
  statusId: z.number().int().positive("Estado invalido"),
})

export type UpdateProductStatusInput = z.infer<typeof UpdateProductStatusSchema>
