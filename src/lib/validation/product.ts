import { z } from "zod"

const NAME_MAX = 120
const DESCRIPTION_MAX = 1000
const PRICE_MAX = 9_999_999
const OPTIONS_MAX = 30
const PUBLIC_ID_MAX = 200

const CLOUDINARY_PUBLIC_ID_REGEX = /^[a-zA-Z0-9_\-/.]+$/

const PriceSchema = z
  .number()
  .int("El precio debe ser un número entero")
  .positive("El precio debe ser mayor a 0")
  .max(PRICE_MAX, "El precio es demasiado alto")

const PublicIdSchema = z
  .string()
  .trim()
  .max(PUBLIC_ID_MAX, "public_id demasiado largo")
  .regex(CLOUDINARY_PUBLIC_ID_REGEX, "public_id inválido")
  .nullable()

const ImageUrlSchema = z
  .string()
  .url("URL de imagen inválida")
  .startsWith("https://", "La imagen debe servirse por https")
  .max(500, "URL demasiado larga")
  .nullable()

export const CreateProductOptionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la opción es obligatorio")
    .max(NAME_MAX, "El nombre de la opción es demasiado largo"),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, "La descripcion de la opcion es demasiado larga")
    .nullable()
    .optional(),
  price: PriceSchema,
  imageUrl: ImageUrlSchema,
  imagePublicId: PublicIdSchema,
  // true si la imagen es un recorte sin fondo (se subió con "quitar fondo").
  imageRecortada: z.boolean().default(false),
})

export type CreateProductOptionInput = z.infer<typeof CreateProductOptionSchema>

export const CreateProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre del producto es obligatorio")
    .max(NAME_MAX, "El nombre del producto es demasiado largo"),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, "La descripción es demasiado larga")
    .nullable(),
  categoryId: z.number().int().positive("Debes seleccionar una categoría"),
  restaurantId: z.number().int().positive(),
  options: z
    .array(CreateProductOptionSchema)
    .min(1, "Debe haber al menos una opción")
    .max(OPTIONS_MAX, `Máximo ${OPTIONS_MAX} opciones por producto`),
})

export type CreateProductInput = z.infer<typeof CreateProductSchema>

export const UpdateProductOptionSchema = z.object({
  variantId: z.number().int().positive().optional(),
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la opción es obligatorio")
    .max(NAME_MAX, "El nombre de la opción es demasiado largo"),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, "La descripcion de la opcion es demasiado larga")
    .nullable()
    .optional(),
  price: PriceSchema,
  imageUrl: ImageUrlSchema,
  imagePublicId: PublicIdSchema,
  // true si la imagen es un recorte sin fondo (se subió con "quitar fondo").
  imageRecortada: z.boolean().default(false),
})

export type UpdateProductOptionInput = z.infer<typeof UpdateProductOptionSchema>

 
export type ProductOptionForm = {
  localId: string
  variantId?: number
  name: string
  description: string
  price: string
  imageFile: File | null
  processedFile: File | null
  processing: boolean
  removeBg: boolean
  imageUrl: string | null
  imagePublicId: string | null
  // Valor cargado/persistido de si la imagen actual es un recorte sin fondo.
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
    .max(DESCRIPTION_MAX, "La descripción es demasiado larga")
    .nullable(),
  categoryId: z.number().int().positive("Debes seleccionar una categoría"),
  options: z
    .array(UpdateProductOptionSchema)
    .min(1, "Debe haber al menos una opción")
    .max(OPTIONS_MAX, `Máximo ${OPTIONS_MAX} opciones por producto`),
  initialVariantIds: z.array(z.number().int().positive()),
})

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>

export const DeleteProductSchema = z.object({
  productId: z.number().int().positive(),
})

export type DeleteProductInput = z.infer<typeof DeleteProductSchema>

export const UpdateProductStatusSchema = z.object({
  productId: z.number().int().positive(),
  statusId: z.number().int().positive("Estado inválido"),
})

export type UpdateProductStatusInput = z.infer<typeof UpdateProductStatusSchema>
