import { z } from "zod"




// Una elección del comensal en una promo "build" (arma tu promo).
export const CreateOrderSelectionSchema = z.object({
  groupId: z.number().int().positive(),
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
})

// Personalización de ingredientes de una línea de producto (quitar/agregar).
export const CreateOrderIngredientChoiceSchema = z.object({
  ingredientId: z.number().int().positive(),
  action: z.enum(["remove", "add"]),
})

export const CreateOrderMenuOptionChoiceSchema = z.object({
  optionId: z.number().int().positive(),
})

export const CreateOrderItemSchema = z
  .object({
    // Un ítem es un PRODUCTO (productId) o una PROMOCIÓN (promotionId), nunca ambos.
    productId: z.number().int().positive().nullable().optional(),
    variantId: z.number().int().positive().nullable().optional(),
    promotionId: z.number().int().positive().nullable().optional(),

    // Solo en promos "build": las opciones elegidas por grupo. La RPC revalida.
    selections: z.array(CreateOrderSelectionSchema).max(50).nullable().optional(),

    // Solo en líneas de producto: personalización de ingredientes. La RPC
    // revalida contra la configuración real del producto.
    ingredientChoices: z.array(CreateOrderIngredientChoiceSchema).max(30).nullable().optional(),
    menuOptionChoices: z.array(CreateOrderMenuOptionChoiceSchema).max(30).nullable().optional(),

    productQuantity: z
      .number()
      .int()
      .min(1, "La cantidad debe ser mayor a 0")
      .max(20, "Cantidad máxima por ítem: 20"),

    notes: z.string().trim().max(250, "La nota es demasiado larga").nullable().optional(),
  })
  .refine((v) => (v.productId != null) !== (v.promotionId != null), {
    message: "Cada ítem debe ser un producto o una promoción",
  })

export type CreateOrderItemInput = z.infer<typeof CreateOrderItemSchema>


export const CreateOrderSchema = z.object({
  // Token del QR (32 chars): credencial de capacidad de la mesa. Reemplaza
  // al table_id enumerable como argumento de las RPC públicas.
  qrToken: z.string().min(32).max(64),
  dinerToken: z.string().min(8).max(128).nullable().optional(),
  couponCode: z.string().trim().max(40).nullable().optional(),
  customerLocation: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
  items: z
    .array(CreateOrderItemSchema)
    .min(1, "Debe haber al menos un item en el pedido")
    .max(30, "Demasiados ítems en un solo pedido (máximo 30)"),
})

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>
