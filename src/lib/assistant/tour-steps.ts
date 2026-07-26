import { ADMIN_MODULE_BY_ROUTE } from "@/lib/module-visibility"

/**
 * TOUR GUIADO de Manuel: los pasos se DERIVAN en runtime de
 * ADMIN_MODULE_BY_ROUTE (cuyo orden de inserción ES el orden del sidebar,
 * de arriba a abajo) cruzado con:
 *   - los módulos visibles del restaurante (portal /plataforma) → si el
 *     operador habilita un módulo, entra solo al tour en su posición;
 *   - las mismas condiciones contextuales del sidebar (reservas configuradas,
 *     salida por impresora o pantalla, plan multi-sucursal).
 *
 * Un módulo sin descripción propia igual aparece (texto genérico): al agregar
 * módulos nuevos al panel, el tour los incorpora automáticamente — sumar su
 * entrada en TOUR_INFO es solo el pulido.
 */

export type TourStep = {
  moduleKey: string | null
  /** Ruta a la que navega el paso. null = no navega (p. ej. /screen o cierre). */
  route: string | null
  emoji: string
  title: string
  text: string
}

type TourInfo = {
  emoji: string
  title: string
  text: string
  /** false = el paso se explica sin navegar (rutas fuera de /admin matarían el tour). */
  navigate?: boolean
}

const TOUR_INFO: Record<string, TourInfo> = {
  dashboard: {
    emoji: "🏠",
    title: "Resumen",
    text: "Tu punto de partida cada día: ventas del día, pedidos recientes y avisos importantes (como stock crítico) de un vistazo.",
  },
  categories: {
    emoji: "🗂️",
    title: "Categorías",
    text: "Aquí organizas tu carta en secciones (Hamburguesas, Bebidas, Postres…). El comensal navega el menú QR por estas categorías.",
  },
  products: {
    emoji: "🍔",
    title: "Productos",
    text: "El corazón de tu carta: crea productos con precio, foto (puedes quitarle el fondo automáticamente), descripción y variantes. También puedes importar tu menú con IA.",
  },
  promociones: {
    emoji: "🏷️",
    title: "Promociones",
    text: 'Dos tipos: combo fijo (productos definidos a precio especial) y "arma tu promo" (el comensal elige por categoría y paga con % de descuento).',
  },
  descuentos: {
    emoji: "🎟️",
    title: "Descuentos",
    text: "Cupones automáticos con reglas: día de la semana, horario, vigencia, monto mínimo. Se muestran solos al comensal cuando aplican — sin códigos que dictar.",
  },
  inventory: {
    emoji: "📦",
    title: "Inventario",
    text: "Insumos con stock y recetas por producto (la IA puede sugerirlas). Cada venta descuenta stock sola, y puedes elegir si el stock agota productos del menú o solo te alerta.",
  },
  tables: {
    emoji: "🪑",
    title: "Mesas",
    text: "Tus mesas con su código QR: genéralos, descárgalos e imprímelos. El comensal escanea el QR de su mesa y pide sin esperar al mesero.",
  },
  reservations: {
    emoji: "📅",
    title: "Reservas",
    text: "Reserva mesas por horario. Mientras una mesa está reservada, el QR no acepta pedidos de otros comensales.",
  },
  orders: {
    emoji: "🧾",
    title: "Pedidos",
    text: "Todos los pedidos en vivo con su estado: Nuevo → Preparando → Listo → Pagado. La cocina tiene su propia pantalla (KDS) para trabajar los pedidos.",
  },
  waiters: {
    emoji: "🧑‍🍳",
    title: "Meseros",
    text: "Las cuentas de tu equipo: meseros y cocina. Cada uno recibe su acceso por correo y usa la app del mesero para atender mesas, cobrar y cerrar caja.",
  },
  reports: {
    emoji: "📊",
    title: "Reportes",
    text: "Ventas por período, productos más vendidos, margen de ganancia por producto (según tus recetas) y horas peak. Los mismos datos que yo uso para recomendarte.",
  },
  printer: {
    emoji: "🖨️",
    title: "Impresora",
    text: "La configuración de tu impresora de comandas: aquí defines cómo salen impresos los pedidos para cocina.",
  },
  screen: {
    emoji: "🍳",
    title: "Pantalla de cocina",
    text: "El KDS de tu cocina: los pedidos entran en vivo y el equipo los avanza tocando. Vive en pantalla completa aparte (/screen), así que no te llevo ahora para no cortar el tour.",
    navigate: false,
  },
  settings: {
    emoji: "⚙️",
    title: "Ajustes",
    text: "Nombre y logo del restaurante, plantilla del menú y si los pedidos entran directo a cocina, entre otros.",
  },
  plan: {
    emoji: "⭐",
    title: "Mi plan",
    text: "Tu plan contratado y sus límites (mesas, funciones). Para cambios de plan, habla con el equipo de MESA.",
  },
  pagos: {
    emoji: "💳",
    title: "Pagos",
    text: "Los datos tributarios de tu negocio y las boletas/facturas emitidas. La conexión de tu pasarela de pago (Flow, Mercado Pago o Transbank) vive en Ajustes.",
  },
  caja: {
    emoji: "🧮",
    title: "Caja",
    text: "Abre y cierra el turno de caja, con el desglose de lo cobrado en efectivo, tarjeta y en línea, y el detalle de todos los pagos del día.",
  },
  api: {
    emoji: "🔌",
    title: "API",
    text: "Para integrar MESA con otros sistemas: genera llaves de acceso y conecta tu inventario con software externo.",
  },
  soporte: {
    emoji: "🛟",
    title: "Soporte",
    text: "¿Algo no anda o tienes una duda que ni yo pude resolver? Abre un ticket aquí: el equipo de MESA te responde por chat en vivo.",
  },
  instalar: {
    emoji: "📲",
    title: "Instalar app",
    text: "Los instaladores de MESA: el panel para Windows y la app del mesero para Android. Se actualizan solos con cada mejora.",
  },
  sucursales: {
    emoji: "🏢",
    title: "Sucursales",
    text: "Administra todos tus locales desde una sola cuenta: crea sucursales, copia tu carta entre locales y delega administradores por sucursal.",
  },
}

const CLOSING_STEP: TourStep = {
  moduleKey: null,
  route: null,
  emoji: "🎉",
  title: "¡Eso es todo!",
  text: "Ya conoces el panel. Recuerda que tu equipo usa la app del mesero (/waiter) y la cocina su pantalla KDS. Y para lo que necesites — crear cosas, analizar ventas o resolver dudas — aquí estoy yo. ¡Pídeme lo que necesites!",
}

export type TourContext = {
  /** Módulo habilitado por el operador (useVisibleModules, fail-open). */
  isModuleVisible: (key: string) => boolean
  restaurant?: {
    reservation_contact_type?: string | null
    output_mode?: string | null
  } | null
  plan?: { has_multi_branch?: boolean; is_owner?: boolean } | null
}

// Espejo de las condiciones contextuales del sidebar (AdminSidebar.tsx):
// además del toggle del portal, algunos ítems dependen de la config del
// restaurante o del plan. Mantener en sync al cambiar el sidebar.
const CONTEXT_CONDITIONS: Record<string, (ctx: TourContext) => boolean> = {
  reservations: (ctx) =>
    Boolean(
      ctx.restaurant?.reservation_contact_type &&
        ctx.restaurant.reservation_contact_type !== "none"
    ),
  printer: (ctx) => ctx.restaurant?.output_mode === "printer",
  screen: (ctx) => ctx.restaurant?.output_mode === "screen",
  sucursales: (ctx) => Boolean(ctx.plan?.has_multi_branch && ctx.plan?.is_owner),
}

function fallbackTitle(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ")
}

/** Construye los pasos del tour en el ORDEN DEL SIDEBAR (arriba → abajo). */
export function buildTourSteps(ctx: TourContext): TourStep[] {
  const steps: TourStep[] = Object.entries(ADMIN_MODULE_BY_ROUTE)
    .filter(([, key]) => ctx.isModuleVisible(key))
    .filter(([, key]) => CONTEXT_CONDITIONS[key]?.(ctx) ?? true)
    .map(([route, key]) => {
      const info = TOUR_INFO[key]
      if (!info) {
        // Módulo sin descripción todavía: entra igual al tour (genérico).
        return {
          moduleKey: key,
          route,
          emoji: "✨",
          title: fallbackTitle(key),
          text: "Un módulo nuevo de tu panel. Entra y explóralo — y si tienes dudas, pregúntame por el chat.",
        }
      }
      return {
        moduleKey: key,
        route: info.navigate === false ? null : route,
        emoji: info.emoji,
        title: info.title,
        text: info.text,
      }
    })

  return [...steps, CLOSING_STEP]
}
