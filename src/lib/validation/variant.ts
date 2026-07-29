import { z } from "zod"



export const CreateVariantSchema = z.object({
  productId: z.number().int().positive(),
  name: z.string().trim().min(1, "El nombre de la variante es obligatorio"),
  description: z.string().trim().max(1000, "La descripcion de la variante es demasiado larga").nullable().optional(),
  price: z.number().positive("El precio debe ser mayor a 0"),
  imageUrl: z.string().url().nullable(),
  imagePublicId: z.string().nullable(),
})

export type CreateVariantInput = z.infer<typeof CreateVariantSchema>



export const UpdateVariantSchema = z.object({
  variantId: z.number().int().positive(),
  name: z.string().trim().min(1, "El nombre de la variante es obligatorio"),
  description: z.string().trim().max(1000, "La descripcion de la variante es demasiado larga").nullable().optional(),
  price: z.number().positive("El precio debe ser mayor a 0"),
  imageUrl: z.string().url().nullable(),
  imagePublicId: z.string().nullable(),
})

export type UpdateVariantInput = z.infer<typeof UpdateVariantSchema>


export const DeleteVariantSchema = z.object({
  variantId: z.number().int().positive(),
})

export type DeleteVariantInput = z.infer<typeof DeleteVariantSchema>
