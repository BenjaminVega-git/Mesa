import "server-only"
import { SchemaType, type FunctionDeclaration } from "@google/generative-ai"
import { revalidateTag } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createCategory } from "@/services/category-service"
import { createProduct } from "@/services/product-service"
import { getSalesReport, getProductMargins, getPeakHours } from "@/services/report-service"
import { listIngredients, restockIngredient } from "@/services/inventory-service"
import { menuTag } from "@/lib/menu/menu-cache"

/**
 * Herramientas del ASISTENTE IA del panel admin. Cada ejecutor corre con el
 * cliente Supabase de LA SESIÓN DEL ADMIN (nunca service_role): las RPCs con
 * guard y las policies RLS imponen al asistente exactamente los mismos límites
 * que al usuario — no puede leer ni tocar nada fuera de su restaurante.
 *
 * Diseño: las herramientas de escritura son BATCH (crear N categorías en una
 * llamada) para acortar el bucle agéntico, y NO existen herramientas de
 * borrado (decisión de producto: eliminar queda manual).
 */

export type AssistantContext = {
  supabase: SupabaseClient
  restaurantId: number
}

// Etiquetas humanas para el log de acciones del chat.
export const TOOL_LABELS: Record<string, string> = {
  obtener_resumen_negocio: "Revisando tu carta y tu negocio",
  obtener_reporte_ventas: "Analizando tus ventas",
  obtener_margenes_y_horas_peak: "Calculando márgenes y horas peak",
  obtener_alertas_inventario: "Revisando alertas de inventario",
  estado_operacion_hoy: "Mirando la operación de hoy",
  listar_insumos: "Revisando tu inventario",
  listar_cupones: "Revisando tus cupones",
  listar_promociones: "Revisando tus promociones",
  listar_equipo: "Revisando tu equipo",
  crear_categorias: "Creando categorías",
  crear_productos: "Creando productos",
  actualizar_productos: "Actualizando productos",
  cambiar_disponibilidad: "Cambiando disponibilidad",
  crear_cupon: "Creando cupón",
  crear_promocion: "Creando promoción",
  crear_promo_armable: "Creando promo armable",
  iniciar_tour: "Preparando el tour guiado",
  gestionar_cupones: "Activando/desactivando cupones",
  gestionar_promociones: "Activando/ocultando promociones",
  reponer_insumos: "Registrando reposición de stock",
}

// Herramientas que modifican datos (para marcarlas en el log del chat).
export const WRITE_TOOLS = new Set([
  "crear_categorias",
  "crear_productos",
  "actualizar_productos",
  "cambiar_disponibilidad",
  "crear_cupon",
  "crear_promocion",
  "crear_promo_armable",
  "gestionar_cupones",
  "gestionar_promociones",
  "reponer_insumos",
])

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "obtener_resumen_negocio",
    description:
      "Foto actual del restaurante: nombre, categorías con conteo de productos, listado de productos (id, nombre, precio, categoría, estado) y cuántas promociones/cupones activos hay. Úsala SIEMPRE antes de crear o modificar cosas, para no duplicar y conocer el contexto.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "obtener_reporte_ventas",
    description:
      "Ventas del período: total facturado, cantidad de pedidos, ticket promedio y productos más vendidos.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dias: {
          type: SchemaType.NUMBER,
          description: "Días hacia atrás (1 = hoy, 7 = última semana, 30 = último mes). Máx 90.",
        },
      },
      required: ["dias"],
    },
  },
  {
    name: "obtener_margenes_y_horas_peak",
    description:
      "Margen de ganancia por producto (según recetas/costos de insumos) y ventas por hora del día (horas peak) del período.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dias: { type: SchemaType.NUMBER, description: "Días hacia atrás. Máx 90." },
      },
      required: ["dias"],
    },
  },
  {
    name: "obtener_alertas_inventario",
    description: "Insumos sin stock o con stock bajo el mínimo (para recomendar reposición).",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "estado_operacion_hoy",
    description:
      "Cómo va la operación AHORA: pedidos activos (nuevos/preparando/listos) con mesa y monto, y las ventas acumuladas de hoy. Úsala para '¿cómo va el día?' o '¿hay pedidos pendientes?'.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "listar_insumos",
    description:
      "Inventario completo: cada insumo con su unidad, stock actual y stock mínimo (no solo alertas).",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "listar_equipo",
    description: "Cuentas del equipo del restaurante (meseros, cocina, etc.) con su rol.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "listar_cupones",
    description: "Cupones de descuento existentes con sus reglas y estado.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "listar_promociones",
    description: "Promociones existentes (combos fijos y 'arma tu promo') con su detalle.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "crear_categorias",
    description:
      "Crea varias categorías de productos de una sola vez. No crea duplicadas (verifica antes con obtener_resumen_negocio).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        nombres: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Nombres de las categorías a crear (1 a 20).",
        },
      },
      required: ["nombres"],
    },
  },
  {
    name: "crear_productos",
    description:
      "Crea varios productos de una sola vez. Cada producto necesita una categoría EXISTENTE (id de obtener_resumen_negocio o crear_categorias). Precios en pesos chilenos enteros.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        productos: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              nombre: { type: SchemaType.STRING },
              precio: { type: SchemaType.NUMBER, description: "CLP entero, > 0" },
              categoria_id: { type: SchemaType.NUMBER },
              descripcion: { type: SchemaType.STRING, description: "Opcional" },
            },
            required: ["nombre", "precio", "categoria_id"],
          },
        },
      },
      required: ["productos"],
    },
  },
  {
    name: "actualizar_productos",
    description:
      "Modifica productos existentes: nombre, precio, descripción y/o categoría. Solo enviar los campos a cambiar. OJO: el precio solo se puede cambiar en productos SIN variantes (si tiene variantes, avisar al usuario que lo edite manualmente).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        cambios: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              producto_id: { type: SchemaType.NUMBER },
              nombre: { type: SchemaType.STRING },
              precio: { type: SchemaType.NUMBER },
              descripcion: { type: SchemaType.STRING },
              categoria_id: { type: SchemaType.NUMBER },
            },
            required: ["producto_id"],
          },
        },
      },
      required: ["cambios"],
    },
  },
  {
    name: "cambiar_disponibilidad",
    description:
      "Cambia el estado de productos en el menú: 'disponible' (se vende), 'agotado' (visible pero sin stock) o 'deshabilitado' (oculto).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        cambios: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              producto_id: { type: SchemaType.NUMBER },
              estado: {
                type: SchemaType.STRING,
                description: "'disponible' | 'agotado' | 'deshabilitado'",
              },
            },
            required: ["producto_id", "estado"],
          },
        },
      },
      required: ["cambios"],
    },
  },
  {
    name: "crear_cupon",
    description:
      "Crea un cupón de descuento automático para el menú QR. Se muestra solo al comensal cuando aplica (día/horario/vigencia).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        codigo: { type: SchemaType.STRING, description: "Código corto único, ej. LUNES10" },
        tipo: { type: SchemaType.STRING, description: "'percent' (porcentaje) o 'amount' (monto fijo CLP)" },
        valor: { type: SchemaType.NUMBER, description: "1-100 si percent; CLP entero si amount" },
        descripcion: { type: SchemaType.STRING, description: "Opcional" },
        alcance: {
          type: SchemaType.STRING,
          description: "Opcional: 'all' (default, toda la carta), 'categoria' o 'producto'",
        },
        categoria_id: { type: SchemaType.NUMBER, description: "Requerido si alcance='categoria'" },
        producto_id: { type: SchemaType.NUMBER, description: "Requerido si alcance='producto'" },
        dias_semana: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
          description: "Opcional. 0=domingo … 6=sábado. Omitir = todos los días.",
        },
        hora_desde: { type: SchemaType.STRING, description: "Opcional, 'HH:MM' (con hora_hasta)" },
        hora_hasta: { type: SchemaType.STRING, description: "Opcional, 'HH:MM'" },
        valido_desde: { type: SchemaType.STRING, description: "Opcional, 'YYYY-MM-DD'" },
        valido_hasta: { type: SchemaType.STRING, description: "Opcional, 'YYYY-MM-DD'" },
        monto_minimo: { type: SchemaType.NUMBER, description: "Opcional, pedido mínimo CLP" },
        limite_usos: { type: SchemaType.NUMBER, description: "Opcional, máximo de usos totales" },
      },
      required: ["codigo", "tipo", "valor"],
    },
  },
  {
    name: "crear_promocion",
    description:
      "Crea un COMBO FIJO: productos definidos a un precio fijo menor que la suma de carta (ej. 'Completo + bebida a $5.990'). Usa product_id de obtener_resumen_negocio.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        nombre: { type: SchemaType.STRING },
        descripcion: { type: SchemaType.STRING, description: "Opcional" },
        precio: { type: SchemaType.NUMBER, description: "Precio del combo, CLP entero, menor a la suma de carta" },
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              producto_id: { type: SchemaType.NUMBER },
              cantidad: { type: SchemaType.NUMBER, description: "Default 1" },
            },
            required: ["producto_id"],
          },
        },
      },
      required: ["nombre", "precio", "items"],
    },
  },
  {
    name: "crear_promo_armable",
    description:
      "Crea una promo 'ARMA TU PROMO': el comensal elige productos por grupos anclados a categorías (ej. 1 hamburguesa + 1 bebida) y paga la suma de lo elegido menos un % de descuento.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        nombre: { type: SchemaType.STRING },
        descripcion: { type: SchemaType.STRING, description: "Opcional" },
        descuento_pct: { type: SchemaType.NUMBER, description: "% de descuento (1-100) sobre lo elegido" },
        grupos: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              nombre: { type: SchemaType.STRING, description: "Ej. 'Tu hamburguesa'" },
              categoria_id: { type: SchemaType.NUMBER },
              min: { type: SchemaType.NUMBER, description: "Mínimo a elegir (default 1)" },
              max: { type: SchemaType.NUMBER, description: "Máximo a elegir (default 1)" },
            },
            required: ["categoria_id"],
          },
        },
      },
      required: ["nombre", "descuento_pct", "grupos"],
    },
  },
  {
    // OJO: esta herramienta se ejecuta en el CLIENTE (la ruta la intercepta y
    // emite un client_action al chat; no pasa por executeTool). Abre el tour
    // guiado visual que recorre los módulos del panel paso a paso.
    name: "iniciar_tour",
    description:
      "Inicia el TOUR GUIADO visual por el panel: navega módulo por módulo (carta, promociones, inventario, reportes, pagos, etc.) con una tarjeta explicativa y controles Siguiente/Anterior. Úsala cuando pidan un tour, un recorrido, conocer la plataforma o que les muestres cómo funciona MESA.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "gestionar_cupones",
    description: "Activa o desactiva cupones existentes (ids de listar_cupones). NO los borra.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        cambios: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              cupon_id: { type: SchemaType.NUMBER },
              activo: { type: SchemaType.BOOLEAN },
            },
            required: ["cupon_id", "activo"],
          },
        },
      },
      required: ["cambios"],
    },
  },
  {
    name: "gestionar_promociones",
    description:
      "Activa u oculta promociones existentes del menú (ids de listar_promociones). NO las borra.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        cambios: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              promocion_id: { type: SchemaType.NUMBER },
              activa: { type: SchemaType.BOOLEAN },
            },
            required: ["promocion_id", "activa"],
          },
        },
      },
      required: ["cambios"],
    },
  },
  {
    name: "reponer_insumos",
    description:
      "Registra la reposición de stock de insumos (compras/llegada de mercadería). Suma la cantidad al stock actual y queda en el historial de movimientos. Usa insumo_id de listar_insumos u obtener_alertas_inventario.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reposiciones: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              insumo_id: { type: SchemaType.NUMBER },
              cantidad: { type: SchemaType.NUMBER, description: "Cantidad a SUMAR, en la unidad del insumo" },
              nota: { type: SchemaType.STRING, description: "Opcional, ej. 'compra proveedor X'" },
            },
            required: ["insumo_id", "cantidad"],
          },
        },
      },
      required: ["reposiciones"],
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Ejecutores
// ─────────────────────────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>

function refreshMenu(restaurantId: number) {
  try {
    revalidateTag(menuTag(restaurantId), "max")
  } catch {
    // fuera de contexto de revalidación: ignorar
  }
}

function rangeFromDays(diasRaw: unknown) {
  // `Number(x) || 7` trataba dias:0 igual que "no especificado" (caía a 7 en
  // vez de 1 = hoy, como documentan las tool declarations). Solo se usa el
  // default cuando el valor no es un número válido, no cuando es 0.
  const parsed = Number(diasRaw)
  const dias = Math.max(1, Math.min(90, Number.isFinite(parsed) ? parsed : 7))
  const to = new Date()
  const from = new Date(to.getTime() - dias * 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    granularity: (dias <= 2 ? "hour" : "day") as "hour" | "day",
  }
}

async function resumenNegocio(ctx: AssistantContext) {
  const [restaurant, categories, products, promos, coupons] = await Promise.all([
    ctx.supabase
      .from("restaurants")
      .select("restaurant_name, stock_menu_mode")
      .eq("id", ctx.restaurantId)
      .maybeSingle(),
    ctx.supabase
      .from("categories")
      .select("id, category_name")
      .eq("restaurant_id", ctx.restaurantId)
      .order("id"),
    ctx.supabase
      .from("products")
      .select("id, product_name, product_price, category_id, status_id, product_variants(id, variant_name, variant_price)")
      .eq("restaurant_id", ctx.restaurantId)
      .order("id")
      .limit(200),
    ctx.supabase.rpc("promo_list"),
    ctx.supabase.rpc("discount_list"),
  ])

  const estados: Record<number, string> = { 1: "disponible", 2: "agotado", 3: "deshabilitado" }
  const cats = (categories.data ?? []) as { id: number; category_name: string }[]
  const prods = (products.data ?? []) as {
    id: number
    product_name: string
    product_price: number
    category_id: number | null
    status_id: number
    product_variants?: { id: number; variant_name: string; variant_price: number }[]
  }[]

  return {
    restaurante: restaurant.data?.restaurant_name ?? "(sin nombre)",
    categorias: cats.map((c) => ({
      id: c.id,
      nombre: c.category_name,
      productos: prods.filter((p) => p.category_id === c.id).length,
    })),
    productos: prods.map((p) => ({
      id: p.id,
      nombre: p.product_name,
      precio: p.product_price,
      categoria_id: p.category_id,
      estado: estados[p.status_id] ?? String(p.status_id),
      variantes: (p.product_variants ?? []).map((v) => ({
        id: v.id,
        nombre: v.variant_name,
        precio: v.variant_price,
      })),
    })),
    promociones_activas: Array.isArray(promos.data)
      ? (promos.data as { active?: boolean }[]).filter((p) => p.active).length
      : 0,
    cupones_activos: Array.isArray(coupons.data)
      ? (coupons.data as { active?: boolean }[]).filter((c) => c.active).length
      : 0,
  }
}

async function crearCategorias(ctx: AssistantContext, args: ToolArgs) {
  const nombres = (Array.isArray(args.nombres) ? args.nombres : [])
    .map((n) => String(n).trim())
    .filter(Boolean)
    .slice(0, 20)
  if (nombres.length === 0) return { error: "No se recibieron nombres de categorías" }

  const resultados = await Promise.all(
    nombres.map(async (nombre) => {
      const res = await createCategory({ name: nombre, restaurantId: ctx.restaurantId })
      return res.ok
        ? { id: (res.data as { id: number }).id, nombre, ok: true }
        : { id: 0, nombre, ok: false, error: res.error }
    })
  )
  const creadas = resultados.filter((r) => r.ok).map((r) => ({ id: r.id, nombre: r.nombre }))
  const errores = resultados.filter((r) => !r.ok).map((r) => `${r.nombre}: ${r.error}`)
  return { creadas, errores }
}

async function crearProductos(ctx: AssistantContext, args: ToolArgs) {
  const items = (Array.isArray(args.productos) ? args.productos : []).slice(0, 30) as {
    nombre?: unknown
    precio?: unknown
    categoria_id?: unknown
    descripcion?: unknown
  }[]
  if (items.length === 0) return { error: "No se recibieron productos" }

  // Categorías del PROPIO restaurante: sin este chequeo, un categoria_id de
  // otro tenant (los ids son correlativos globales, adivinables) quedaba
  // aceptado igual — el producto terminaba agrupado bajo la categoría de otro
  // restaurante en el menú público y desaparecía de obtener_resumen_negocio.
  const { data: categoriasPropias } = await ctx.supabase
    .from("categories")
    .select("id")
    .eq("restaurant_id", ctx.restaurantId)
  const categoriaIds = new Set((categoriasPropias ?? []).map((c) => c.id as number))

  const resultados = await Promise.all(
    items.map(async (it) => {
      const nombre = String(it.nombre ?? "").trim() || "(sin nombre)"
      const precio = Math.round(Number(it.precio) || 0)
      const categoriaId = Number(it.categoria_id) || 0
      if (!categoriaIds.has(categoriaId)) {
        return { id: 0, nombre, ok: false, error: `la categoría ${categoriaId} no existe en tu restaurante` }
      }
      const res = await createProduct({
        name: nombre,
        description: it.descripcion ? String(it.descripcion).trim() : null,
        categoryId: categoriaId,
        restaurantId: ctx.restaurantId,
        options: [
          { name: nombre, price: precio, imageUrl: null, imagePublicId: null, imageRecortada: false },
        ],
        menuOptions: [],
      })
      return res.ok
        ? { id: (res.data as { id: number }).id, nombre, ok: true }
        : { id: 0, nombre, ok: false, error: res.error }
    })
  )
  const creados = resultados.filter((r) => r.ok).map((r) => ({ id: r.id, nombre: r.nombre }))
  const errores = resultados.filter((r) => !r.ok).map((r) => `${r.nombre}: ${r.error}`)
  return { creados, errores }
}

async function actualizarProductos(ctx: AssistantContext, args: ToolArgs) {
  const cambios = (Array.isArray(args.cambios) ? args.cambios : []).slice(0, 30) as {
    producto_id?: unknown
    nombre?: unknown
    precio?: unknown
    descripcion?: unknown
    categoria_id?: unknown
  }[]
  if (cambios.length === 0) return { error: "No se recibieron cambios" }

  const resultados = await Promise.all(
    cambios.map(async (c) => {
      const id = Number(c.producto_id) || 0
      // Leer el producto del propio restaurante (scope explícito además de RLS).
      const { data: prod } = await ctx.supabase
        .from("products")
        .select("id, product_name, product_variants(id)")
        .eq("id", id)
        .eq("restaurant_id", ctx.restaurantId)
        .maybeSingle()
      if (!prod) return { id, ok: false, errores: ["no encontrado en tu restaurante"] }

      // Cada campo se valida por separado y los válidos se aplican aunque
      // OTRO campo del mismo producto falle — antes, si p.ej. la categoría no
      // existía, se perdía también el nombre/descripción ya validados del
      // mismo item porque el `continue` saltaba el update completo.
      const patch: Record<string, unknown> = {}
      const erroresCampo: string[] = []

      if (c.nombre != null && String(c.nombre).trim()) patch.product_name = String(c.nombre).trim()
      if (c.descripcion != null) patch.product_description = String(c.descripcion).trim() || null

      if (c.categoria_id != null) {
        const catId = Number(c.categoria_id) || 0
        const { data: cat } = await ctx.supabase
          .from("categories")
          .select("id")
          .eq("id", catId)
          .eq("restaurant_id", ctx.restaurantId)
          .maybeSingle()
        if (!cat) erroresCampo.push(`la categoría ${catId} no existe en tu restaurante`)
        else patch.category_id = catId
      }

      if (c.precio != null) {
        const hasVariants = ((prod.product_variants as { id: number }[] | null) ?? []).length > 0
        if (hasVariants) {
          erroresCampo.push("tiene variantes; el precio se edita por variante desde el panel")
        } else {
          const precio = Math.round(Number(c.precio) || 0)
          if (precio <= 0) erroresCampo.push("precio inválido")
          else patch.product_price = precio
        }
      }

      if (Object.keys(patch).length === 0) {
        return { id, ok: false, errores: erroresCampo.length > 0 ? erroresCampo : ["sin campos para cambiar"] }
      }

      const { error } = await ctx.supabase
        .from("products")
        .update(patch)
        .eq("id", id)
        .eq("restaurant_id", ctx.restaurantId)
      if (error) return { id, ok: false, errores: [...erroresCampo, error.message] }
      return { id, ok: true, errores: erroresCampo }
    })
  )

  const actualizados = resultados.filter((r) => r.ok).map((r) => r.id)
  const errores = resultados.flatMap((r) => r.errores.map((e) => `Producto ${r.id}: ${e}`))

  if (actualizados.length > 0) refreshMenu(ctx.restaurantId)
  return { actualizados, errores }
}

async function cambiarDisponibilidad(ctx: AssistantContext, args: ToolArgs) {
  const cambios = (Array.isArray(args.cambios) ? args.cambios : []).slice(0, 50) as {
    producto_id?: unknown
    estado?: unknown
  }[]
  const map: Record<string, number> = { disponible: 1, agotado: 2, deshabilitado: 3 }

  const resultados = await Promise.all(
    cambios.map(async (c) => {
      const id = Number(c.producto_id) || 0
      const statusId = map[String(c.estado ?? "").toLowerCase()]
      if (!statusId) return { id, ok: false, error: `estado inválido "${c.estado}"` }
      const { data, error } = await ctx.supabase
        .from("products")
        .update({ status_id: statusId })
        .eq("id", id)
        .eq("restaurant_id", ctx.restaurantId)
        .select("id")
      if (error || !data?.length) return { id, ok: false, error: error?.message ?? "no encontrado" }
      return { id, ok: true }
    })
  )
  const actualizados = resultados.filter((r) => r.ok).map((r) => r.id)
  const errores = resultados.filter((r) => !r.ok).map((r) => `Producto ${r.id}: ${r.error}`)

  if (actualizados.length > 0) refreshMenu(ctx.restaurantId)
  return { actualizados, errores }
}

async function crearCupon(ctx: AssistantContext, args: ToolArgs) {
  const tipo = String(args.tipo ?? "percent")
  // Alcance: toda la carta (default), una categoría o un producto puntual.
  const alcanceRaw = String(args.alcance ?? "all").toLowerCase()
  const scope =
    alcanceRaw === "categoria" || alcanceRaw === "category"
      ? "category"
      : alcanceRaw === "producto" || alcanceRaw === "product"
        ? "product"
        : "all"
  // La RPC trata "solo una de las dos" como SIN restricción horaria (queda
  // disponible todo el día) — eso contradice la intención de un cupón "desde
  // las 18:00", así que se exigen ambas juntas o ninguna.
  const horaDesde = args.hora_desde ? String(args.hora_desde) : null
  const horaHasta = args.hora_hasta ? String(args.hora_hasta) : null
  if ((horaDesde && !horaHasta) || (!horaDesde && horaHasta)) {
    return {
      error:
        "Para restringir el cupón por horario hay que indicar hora_desde Y hora_hasta juntas; si falta una, el cupón queda disponible todo el día.",
    }
  }

  const { data, error } = await ctx.supabase.rpc("discount_save", {
    p_id: null,
    p_code: String(args.codigo ?? "").trim(),
    p_description: args.descripcion ? String(args.descripcion) : null,
    p_discount_type: tipo === "amount" ? "amount" : "percent",
    p_discount_value: Math.round(Number(args.valor) || 0),
    p_scope: scope,
    p_scope_category_id: scope === "category" ? Number(args.categoria_id) || null : null,
    p_scope_product_id: scope === "product" ? Number(args.producto_id) || null : null,
    p_days_of_week: Array.isArray(args.dias_semana)
      ? (args.dias_semana as unknown[]).map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
      : null,
    p_time_from: horaDesde,
    p_time_to: horaHasta,
    p_valid_from: args.valido_desde ? String(args.valido_desde) : null,
    p_valid_to: args.valido_hasta ? String(args.valido_hasta) : null,
    p_min_order_amount: args.monto_minimo ? Math.round(Number(args.monto_minimo)) : null,
    p_usage_limit: args.limite_usos ? Math.round(Number(args.limite_usos)) : null,
    p_active: true,
  })
  if (error) return { error: error.message }
  return { cupon_id: data, codigo: String(args.codigo ?? "").trim() }
}

async function crearPromocion(ctx: AssistantContext, args: ToolArgs) {
  const items = (Array.isArray(args.items) ? args.items : []) as {
    producto_id?: unknown
    cantidad?: unknown
  }[]
  const { data, error } = await ctx.supabase.rpc("promo_save", {
    p_id: null,
    p_name: String(args.nombre ?? "").trim(),
    p_description: args.descripcion ? String(args.descripcion) : null,
    p_promo_price: Math.round(Number(args.precio) || 0),
    p_image_url: null,
    p_active: true,
    p_items: items.map((it) => ({
      product_id: Number(it.producto_id) || 0,
      variant_id: null,
      quantity: Math.max(1, Math.round(Number(it.cantidad) || 1)),
    })),
    p_kind: "fixed",
    p_groups: [],
    p_discount_type: "percent",
    p_discount_pct: null,
    p_discount_amount: null,
  })
  if (error) return { error: error.message }
  refreshMenu(ctx.restaurantId)
  return { promocion_id: data, nombre: String(args.nombre ?? "").trim() }
}

async function crearPromoArmable(ctx: AssistantContext, args: ToolArgs) {
  const grupos = (Array.isArray(args.grupos) ? args.grupos : []) as {
    nombre?: unknown
    categoria_id?: unknown
    min?: unknown
    max?: unknown
  }[]
  const { data, error } = await ctx.supabase.rpc("promo_save", {
    p_id: null,
    p_name: String(args.nombre ?? "").trim(),
    p_description: args.descripcion ? String(args.descripcion) : null,
    p_promo_price: 0,
    p_image_url: null,
    p_active: true,
    p_items: [],
    p_kind: "build",
    p_groups: grupos.map((g, i) => ({
      category_id: Number(g.categoria_id) || 0,
      name: String(g.nombre ?? "").trim(),
      min_select: Math.max(0, Math.round(Number(g.min) || 1)),
      max_select: Math.max(1, Math.round(Number(g.max) || 1)),
      sort_order: i,
    })),
    p_discount_type: "percent",
    p_discount_pct: Math.round(Number(args.descuento_pct) || 0),
    p_discount_amount: null,
  })
  if (error) return { error: error.message }
  refreshMenu(ctx.restaurantId)
  return { promocion_id: data, nombre: String(args.nombre ?? "").trim() }
}

async function estadoOperacionHoy(ctx: AssistantContext) {
  const estados: Record<number, string> = { 1: "nuevo", 2: "preparando", 3: "listo" }
  const [activos, ventasHoy] = await Promise.all([
    ctx.supabase
      .from("orders")
      .select("id, status_id, total, created_at, tables(table_number)")
      .eq("restaurant_id", ctx.restaurantId)
      .in("status_id", [1, 2, 3])
      .order("created_at", { ascending: true })
      .limit(30),
    getSalesReport(rangeFromDays(1)),
  ])

  const pedidos = ((activos.data ?? []) as {
    id: number
    status_id: number
    total: number | null
    created_at: string | null
    tables: { table_number: number | null } | { table_number: number | null }[] | null
  }[]).map((o) => {
    const t = Array.isArray(o.tables) ? o.tables[0] : o.tables
    return {
      pedido_id: o.id,
      estado: estados[o.status_id] ?? String(o.status_id),
      mesa: t?.table_number ?? null,
      total: o.total ?? 0,
      creado: o.created_at,
    }
  })

  return {
    pedidos_activos: pedidos,
    conteo_por_estado: {
      nuevos: pedidos.filter((p) => p.estado === "nuevo").length,
      preparando: pedidos.filter((p) => p.estado === "preparando").length,
      listos: pedidos.filter((p) => p.estado === "listo").length,
    },
    ventas_hoy: ventasHoy.ok
      ? { ...ventasHoy.data.summary, top_productos: ventasHoy.data.topProducts.slice(0, 5) }
      : { error: ventasHoy.error },
  }
}

async function gestionarCupones(ctx: AssistantContext, args: ToolArgs) {
  const cambios = (Array.isArray(args.cambios) ? args.cambios : []).slice(0, 20) as {
    cupon_id?: unknown
    activo?: unknown
  }[]
  const resultados = await Promise.all(
    cambios.map(async (c) => {
      const id = Number(c.cupon_id) || 0
      const { error } = await ctx.supabase.rpc("discount_set_active", {
        p_id: id,
        p_active: Boolean(c.activo),
      })
      return error ? { id, ok: false, error: error.message } : { id, ok: true }
    })
  )
  const actualizados = resultados.filter((r) => r.ok).map((r) => r.id)
  const errores = resultados.filter((r) => !r.ok).map((r) => `Cupón ${r.id}: ${r.error}`)
  return { actualizados, errores }
}

async function gestionarPromociones(ctx: AssistantContext, args: ToolArgs) {
  const cambios = (Array.isArray(args.cambios) ? args.cambios : []).slice(0, 20) as {
    promocion_id?: unknown
    activa?: unknown
  }[]
  const resultados = await Promise.all(
    cambios.map(async (c) => {
      const id = Number(c.promocion_id) || 0
      const { error } = await ctx.supabase.rpc("promo_set_active", {
        p_id: id,
        p_active: Boolean(c.activa),
      })
      return error ? { id, ok: false, error: error.message } : { id, ok: true }
    })
  )
  const actualizados = resultados.filter((r) => r.ok).map((r) => r.id)
  const errores = resultados.filter((r) => !r.ok).map((r) => `Promoción ${r.id}: ${r.error}`)
  if (actualizados.length > 0) refreshMenu(ctx.restaurantId)
  return { actualizados, errores }
}

async function reponerInsumos(_ctx: AssistantContext, args: ToolArgs) {
  const items = (Array.isArray(args.reposiciones) ? args.reposiciones : []).slice(0, 30) as {
    insumo_id?: unknown
    cantidad?: unknown
    nota?: unknown
  }[]
  if (items.length === 0) return { error: "No se recibieron reposiciones" }

  // restockIngredient hace su propio guard de admin + scope de restaurante
  // (no toma ctx); en paralelo, esas verificaciones repetidas corren a la vez
  // en vez de una tras otra para cada ítem del lote.
  const resultados = await Promise.all(
    items.map(async (it) => {
      const id = Number(it.insumo_id) || 0
      const cantidad = Number(it.cantidad) || 0
      if (cantidad <= 0) return { id, ok: false, error: "la cantidad debe ser positiva" }
      const res = await restockIngredient({
        id,
        cantidad,
        nota: it.nota ? String(it.nota).slice(0, 200) : null,
      })
      return res.ok ? { id, ok: true } : { id, ok: false, error: res.error }
    })
  )
  const repuestos = resultados.filter((r) => r.ok).map((r) => r.id)
  const errores = resultados.filter((r) => !r.ok).map((r) => `Insumo ${r.id}: ${r.error}`)
  return { repuestos, errores }
}

export async function executeTool(
  name: string,
  args: ToolArgs,
  ctx: AssistantContext
): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case "obtener_resumen_negocio":
        return await resumenNegocio(ctx)

      case "obtener_reporte_ventas": {
        const res = await getSalesReport(rangeFromDays(args.dias))
        if (!res.ok) return { error: res.error }
        return {
          resumen: res.data.summary,
          top_productos: res.data.topProducts.slice(0, 15),
        }
      }

      case "obtener_margenes_y_horas_peak": {
        const range = rangeFromDays(args.dias)
        const [margins, peaks] = await Promise.all([getProductMargins(range), getPeakHours(range)])
        return {
          margenes: margins.ok ? margins.data.slice(0, 20) : { error: margins.error },
          horas_peak: peaks.ok ? peaks.data : { error: peaks.error },
        }
      }

      case "obtener_alertas_inventario": {
        const { data, error } = await ctx.supabase.rpc("get_inventory_alerts")
        if (error) return { error: error.message }
        return (data ?? {}) as Record<string, unknown>
      }

      case "estado_operacion_hoy":
        return await estadoOperacionHoy(ctx)

      case "listar_insumos": {
        const res = await listIngredients()
        if (!res.ok) return { error: res.error }
        return {
          insumos: res.data.slice(0, 100).map((i) => ({
            id: i.id,
            nombre: i.name,
            unidad: i.unit,
            stock_actual: i.stock_actual,
            stock_minimo: i.stock_minimo,
          })),
        }
      }

      case "listar_equipo": {
        const { data, error } = await ctx.supabase.rpc("list_waiters_for_admin")
        if (error) return { error: error.message }
        return { equipo: data ?? [] }
      }

      case "listar_cupones": {
        const { data, error } = await ctx.supabase.rpc("discount_list")
        if (error) return { error: error.message }
        return { cupones: data ?? [] }
      }

      case "listar_promociones": {
        const { data, error } = await ctx.supabase.rpc("promo_list")
        if (error) return { error: error.message }
        return { promociones: data ?? [] }
      }

      case "crear_categorias":
        return await crearCategorias(ctx, args)
      case "crear_productos":
        return await crearProductos(ctx, args)
      case "actualizar_productos":
        return await actualizarProductos(ctx, args)
      case "cambiar_disponibilidad":
        return await cambiarDisponibilidad(ctx, args)
      case "crear_cupon":
        return await crearCupon(ctx, args)
      case "crear_promocion":
        return await crearPromocion(ctx, args)
      case "crear_promo_armable":
        return await crearPromoArmable(ctx, args)
      case "gestionar_cupones":
        return await gestionarCupones(ctx, args)
      case "gestionar_promociones":
        return await gestionarPromociones(ctx, args)
      case "reponer_insumos":
        return await reponerInsumos(ctx, args)

      default:
        return { error: `Herramienta desconocida: ${name}` }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error inesperado ejecutando la herramienta" }
  }
}
