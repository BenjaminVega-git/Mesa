import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaymentAdapter } from "../_shared/payment-adapters.ts";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Metodo no permitido" });

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return reply(500, { error: "Configuracion incompleta" });

  let input: { slug?: string; orderId?: number; requestId?: string; payerEmail?: string };
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "Body invalido" });
  }

  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const orderId = Number(input.orderId);
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  const payerEmail = typeof input.payerEmail === "string" ? input.payerEmail.trim().slice(0, 120) : "";
  if (!slug || !Number.isInteger(orderId) || orderId <= 0 || !requestId) {
    return reply(400, { error: "Pedido invalido" });
  }
  if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    return reply(400, { error: "Email invalido" });
  }

  const admin = createClient(url, svc);
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, restaurant_id, total, status_id, delivery_request_id, delivery_customer_name, delivery_payment_method, fulfillment_type, restaurants!inner(delivery_slug)")
    .eq("id", orderId)
    .eq("order_type", "delivery")
    .eq("delivery_payment_method", "online")
    .eq("delivery_request_id", requestId)
    .maybeSingle();

  const restaurant = Array.isArray(order?.restaurants) ? order.restaurants[0] : order?.restaurants;
  if (orderError || !order || restaurant?.delivery_slug?.toLowerCase() !== slug) {
    return reply(404, { error: "Pedido no encontrado" });
  }
  if (!order.total || order.total <= 0) return reply(409, { error: "El pedido esta en $0" });

  const { data: ctx } = await admin.rpc("payment_gateway_context", { p_restaurant_id: order.restaurant_id });
  if (!ctx || ctx.status !== "connected" || ctx.active === false || !ctx.provider) {
    return reply(409, { error: "Este restaurante no tiene pagos en linea habilitados" });
  }

  let credentials: Record<string, unknown> = {};
  if (typeof ctx.credentials === "string" && ctx.credentials) {
    try { credentials = JSON.parse(ctx.credentials); }
    catch { return reply(500, { error: "Credenciales de la pasarela corruptas" }); }
  }

  const { data: inflight } = await admin
    .from("payments")
    .select("id")
    .contains("order_ids", [order.id])
    .eq("method", "online")
    .in("status", ["pending", "authorized", "paid"])
    .limit(1);
  if (inflight && inflight.length > 0) {
    return reply(429, { error: "Ya hay un pago en curso para este pedido." });
  }

  const { data: payRow, error: payError } = await admin
    .from("payments")
    .insert({
      restaurant_id: order.restaurant_id,
      table_id: null,
      order_ids: [order.id],
      provider: ctx.provider,
      method: "online",
      amount: order.total,
      tip: 0,
      currency: "CLP",
      status: "pending",
      payer_email: payerEmail || null,
    })
    .select("id")
    .single();
  if (payError || !payRow) return reply(500, { error: "No se pudo registrar el pago" });

  const paymentId = payRow.id as number;
  const returnUrl = `${url}/functions/v1/payment-return?provider=${ctx.provider}&pid=${paymentId}&d=${encodeURIComponent(slug)}&oid=${order.id}`;
  const adapter = getPaymentAdapter(ctx.provider);
  const charge = await adapter.createCharge({
    amount: order.total,
    tip: 0,
    currency: "CLP",
    description: `Pedido ${order.fulfillment_type === "pickup" ? "para retiro" : "delivery"} #${order.id}`,
    reference: `MESA-P${paymentId}`,
    payerEmail: payerEmail || null,
    returnUrl,
  }, credentials);

  if (charge.status === "failed" || !charge.checkoutUrl) {
    await admin.from("payments").update({ status: "failed" }).eq("id", paymentId);
    return reply(502, { error: charge.error ?? "La pasarela rechazo el cobro" });
  }
  if (charge.providerPaymentId) {
    await admin.from("payments").update({ provider_payment_id: charge.providerPaymentId }).eq("id", paymentId);
  }
  return reply(200, { checkoutUrl: charge.checkoutUrl, paymentId });
});
