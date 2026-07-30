import "server-only"

/**
 * FAQ curada de las preguntas "¿cómo hago X?" más comunes de un admin de
 * restaurante. El system prompt de Gemini (route.ts) ya tiene la guía
 * COMPLETA de todos los módulos — esto NO la reemplaza ni la resume; es una
 * capa adicional y más chica que intent-router.ts usa para responder estos
 * casos puntuales SIN llamar a Gemini. Cualquier pregunta que no matchee acá
 * sigue yendo a Gemini, que tiene la guía completa para responderla igual.
 */
export type PlatformFaqEntry = {
  /** Frases (ya normalizadas: minúsculas, sin tildes) que, si aparecen como
   *  substring del mensaje del usuario, disparan esta respuesta directa. Se
   *  eligen deliberadamente específicas — mejor no matchear que responder mal. */
  triggers: string[]
  /** Respuesta lista para mostrar al admin cuando el router determinístico
   *  matchea (misma voz que Manuel: tuteo estándar, sin voseo). */
  respuesta: string
}

export const PLATFORM_FAQ: PlatformFaqEntry[] = [
  {
    triggers: ["flujo del comensal", "como pide el comensal", "como funciona el pedido del cliente"],
    respuesta:
      "Así es el flujo del comensal en MESA:\n\n1. Escanea el **QR de su mesa**.\n2. Ve el menú y arma un **carrito compartido** entre todos los que están sentados ahí.\n3. Envía el pedido.\n4. Puede pedir la cuenta (individual o grupal), llamar al mesero, dejar propina y usar cupones vigentes.\n\nSi conectaste una pasarela de pago (Flow, Mercado Pago o Transbank), también puede pagar en línea desde ahí.",
  },
  {
    triggers: [
      "agregar un mesero",
      "agregar mesero",
      "crear un mesero",
      "crear mesero",
      "sumar un mesero",
      "nuevo mesero",
      "como agrego un mesero",
      "dar acceso a un mesero",
    ],
    respuesta:
      "Para agregar un mesero: ve al módulo **Meseros** del panel, crea la cuenta con su nombre y correo, y elige el rol (**mesero** o **cocina**). Le va a llegar un correo con una contraseña temporal para entrar a la app del mesero (/waiter).",
  },
  {
    triggers: [
      "generar los qr",
      "generar qr",
      "descargar los qr",
      "codigo qr de las mesas",
      "qr de las mesas",
      "como hago los qr",
    ],
    respuesta:
      "Los códigos QR de las mesas se generan y descargan desde el módulo **Mesas** del panel: ahí creas cada mesa y bajas su QR para imprimirlo y pegarlo en el local.",
  },
  {
    triggers: [
      "conectar la pasarela",
      "conectar flow",
      "conectar mercado pago",
      "conectar transbank",
      "configurar la pasarela",
      "configurar pago en linea",
      "activar pago en linea",
    ],
    respuesta:
      "La pasarela de pago (Flow, Mercado Pago o Transbank) se conecta desde **Ajustes**: ahí eliges el proveedor e ingresas sus credenciales. Una vez conectada, el comensal puede pagar en línea desde el menú QR.",
  },
  {
    triggers: [
      "pedidos a cocina directa",
      "pedido entra directo a cocina",
      "cocina directa",
      "configurar cocina",
      "pantalla de cocina",
      "kds",
    ],
    respuesta:
      "En **Configuración** puedes elegir si los pedidos nuevos entran directo a cocina (saltándose el paso de mesero) o no. La pantalla de cocina (KDS) vive en **/screen**, para el rol Cocina o el admin — ahí se ven los pedidos avanzando de Nuevo a Preparando a Listo.",
  },
  {
    triggers: [
      "importar el menu",
      "importar menu",
      "importar la carta",
      "importar carta",
      "subir la carta con foto",
      "importar con ia",
      "importar productos con foto",
    ],
    respuesta:
      "Puedes importar tu carta completa desde una foto o PDF del menú: en **Productos → Importar menú**, subes la imagen y la IA identifica los productos, precios y categorías por ti. Después revisas y ajustas antes de guardar.",
  },
  {
    triggers: [
      "instalar la app",
      "instalar app",
      "apk mesero",
      "instalador de windows",
      "como instalo",
      "descargar la app del mesero",
    ],
    respuesta:
      "Los instaladores están en el módulo **Instalar app** del panel: ahí bajas el `.exe` para Windows (impresión térmica y caja) y el `.apk` para el mesero en Android. Ambos se actualizan solos con cada versión nueva.",
  },
  {
    triggers: [
      "dividir la cuenta",
      "dividir cuenta",
      "split de cuenta",
      "cuenta por comensal",
      "dividir por comensal",
    ],
    respuesta:
      "La cuenta se puede dividir desde la app del mesero (**/waiter**), al cobrar la mesa: por comensal (cada uno paga lo suyo) o armando cuentas a medida repartiendo los productos como corresponda.",
  },
]
