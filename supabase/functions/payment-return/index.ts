// Edge Function: payment-return
// URL de retorno del pagador para TODAS las pasarelas (verify_jwt=false:
// vuelve el navegador del comensal, sin JWT). Acepta GET y POST:
//  - Flow: POST form con token (y también urlReturn) — se valida re-consultando.
//  - Mercado Pago: GET con payment_id/collection_id — se valida con la API.
//  - Transbank: GET/POST con token_ws/TBK_* — acá se ejecuta el COMMIT
//    (no hay webhooks), con candado anti doble-commit vía estado 'authorized'.
//  - Simulado: confirma directo (sirve para probar el circuito completo).
// Al final SIEMPRE redirige al comensal a /pago/resultado del app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaymentAdapter } from "../_shared/payment-adapters.ts";

const APP_BASE_URL = "https://tumesaqr.com";

function redirectResult(
  estado: string,
  qrToken: string | null,
  deliverySlug: string | null = null,
  orderId: string | null = null,
): Response {
  if (deliverySlug && /^[a-z0-9][a-z0-9-]*$/i.test(deliverySlug)) {
    const order = orderId && /^\d+$/.test(orderId) ? `&order=${orderId}` : "";
    return new Response(null, {
      status: 303,
      headers: { location: `${APP_BASE_URL}/restaurants/${encodeURIComponent(deliverySlug)}?payment=${estado}${order}` },
    });
  }
  const r = qrToken ? `&r=${encodeURIComponent(qrToken)}` : "";
  return new Response(null, {
    status: 303,
    headers: { location: `${APP_BASE_URL}/pago/resultado?estado=${estado}${r}` },
  });
}

const ESTADO: Record<string, string> = {
  paid: "exito",
  pending: "pendiente",
  authorized: "pendiente",
  failed: "rechazado",
  cancelled: "cancelado",
  refunded: "exito",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Método no permitido", { status: 405 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return new Response("config", { status: 500 });

  const reqUrl = new URL(req.url);
  const query = Object.fromEntries(reqUrl.searchParams.entries());
  const qrToken = query.r ?? null;
  const deliverySlug = query.d ?? null;
  const deliveryOrderId = query.oid ?? null;
  const done = (estado: string) => redirectResult(estado, qrToken, deliverySlug, deliveryOrderId);
  const pid = Number.parseInt(query.pid ?? "", 10);
  if (!Number.isFinite(pid)) return done("error");

  const rawBody = req.method === "POST" ? await req.text() : "";
  const admin = createClient(url, svc);

  const { data: pay } = await admin
    .from("payments")
    .select("id, restaurant_id, provider, provider_payment_id, status, amount, tip")
    .eq("id", pid)
    .maybeSingle();
  if (!pay) return done("error");

  // Refresh / doble visita: estados terminales redirigen directo.
  if (pay.status === "paid" || pay.status === "refunded") return done("exito");
  if (pay.status === "failed") return done("rechazado");

  // Candado: pending → authorized (solo un request procesa; clave para el
  // commit de Transbank, que no admite repetición ciega).
  const { data: locked } = await admin
    .from("payments")
    .update({ status: "authorized" })
    .eq("id", pid)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!locked) {
    // Otro request (o el webhook) lo está procesando: esperar brevemente.
    for (let i = 0; i < 3; i++) {
      await new Promise((res) => setTimeout(res, 1500));
      const { data: again } = await admin.from("payments").select("status").eq("id", pid).maybeSingle();
      if (again && again.status !== "authorized" && again.status !== "pending") {
        return done(ESTADO[again.status] ?? "pendiente");
      }
      if (again && again.status === "paid") return done("exito");
    }
    return done("pendiente");
  }

  // Credenciales de la pasarela del restaurante.
  const { data: ctx } = await admin.rpc("payment_gateway_context", { p_restaurant_id: pay.restaurant_id });
  let credentials: Record<string, unknown> = {};
  if (ctx && typeof ctx.credentials === "string" && ctx.credentials) {
    try {
      credentials = JSON.parse(ctx.credentials);
    } catch {
      credentials = {};
    }
  }

  const adapter = getPaymentAdapter(pay.provider);
  let finalStatus: string | null = null;
  let providerPaymentId: string | null = null;

  try {
    if (pay.provider === "transbank") {
      // El retorno ES la confirmación: parseWebhook distingue los 4 flujos y
      // hace el commit cuando corresponde.
      const result = await adapter.parseWebhook({}, rawBody, credentials, query);
      if (result.valid && result.status) {
        finalStatus = result.status;
        providerPaymentId = result.providerPaymentId ?? null;
      }
    } else if (pay.provider === "flow") {
      const bodyToken = new URLSearchParams(rawBody).get("token");
      const token = bodyToken ?? query.token ?? pay.provider_payment_id;
      if (token) {
        const st = await adapter.getStatus(token, credentials);
        if (!st.error) {
          finalStatus = st.status;
          providerPaymentId = token;
        }
      }
    } else if (pay.provider === "mercadopago") {
      // MP agrega payment_id/collection_id al volver; si no vienen, se busca
      // por la referencia externa (MESA-P{id}).
      const mpId = query.payment_id ?? query.collection_id ?? `MESA-P${pid}`;
      const st = await adapter.getStatus(mpId, credentials);
      if (!st.error) {
        finalStatus = st.status;
        providerPaymentId = st.providerPaymentId ?? null;
      }
    } else {
      // Simulado: confirma directo (getStatus del simulado responde paid).
      const st = await adapter.getStatus(pay.provider_payment_id ?? `SIMPAY-${pid}`, credentials);
      finalStatus = st.status;
      providerPaymentId = pay.provider_payment_id;
    }
  } catch {
    finalStatus = null;
  }

  if (!finalStatus) {
    // No se pudo confirmar (red/pasarela): soltar el candado para que el
    // webhook o un reintento lo resuelvan.
    await admin.from("payments").update({ status: "pending" }).eq("id", pid).eq("status", "authorized");
    return done("pendiente");
  }

  const { data: applied, error: applyErr } = await admin.rpc("payment_apply_gateway_result", {
    p_payment_id: pid,
    p_status: finalStatus,
    p_provider_payment_id: providerPaymentId,
  });
  if (applyErr) {
    await admin.from("payments").update({ status: "pending" }).eq("id", pid).eq("status", "authorized");
    return done("pendiente");
  }

  const settledStatus = (applied as { status?: string } | null)?.status ?? finalStatus;
  return done(ESTADO[settledStatus] ?? "pendiente");
});
