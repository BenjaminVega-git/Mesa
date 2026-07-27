// Edge Function: payment-create-charge
// El COMENSAL (anon, desde el menú QR) inicia el pago en línea de su mesa.
// verify_jwt=false: la credencial es el qr_token vigente (igual que las RPCs
// _qr). El monto NUNCA viene del cliente: se calcula server-side sumando los
// pedidos activos de la mesa. Las credenciales de la pasarela salen de Vault
// vía payment_gateway_context (RPC solo service_role).
//
// Entrada (POST JSON): { qrToken, tip?, payerEmail? }
// Salida: { checkoutUrl, paymentId } | { error }
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
  if (req.method !== "POST") return reply(405, { error: "Método no permitido" });

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return reply(500, { error: "Configuración incompleta" });

  let input: { qrToken?: string; tip?: number; payerEmail?: string };
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "Body inválido" });
  }

  const qrToken = typeof input.qrToken === "string" ? input.qrToken.trim() : "";
  if (!qrToken) return reply(400, { error: "Falta el código de la mesa" });

  const tip = Number.isFinite(input.tip) ? Math.max(0, Math.round(Number(input.tip))) : 0;
  if (tip > 1_000_000) return reply(400, { error: "Propina fuera de rango" });

  const payerEmail = typeof input.payerEmail === "string" ? input.payerEmail.trim().slice(0, 120) : "";
  if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    return reply(400, { error: "Email inválido" });
  }

  const admin = createClient(url, svc);

  // 1) Validar el QR y resolver la mesa.
  const { data: resolved, error: qrErr } = await admin.rpc("resolve_qr_token", { p_qr_token: qrToken });
  const table = Array.isArray(resolved) ? resolved[0] : resolved;
  if (qrErr || !table?.table_id) return reply(404, { error: "Mesa no encontrada o QR inactivo" });

  // 2) Pasarela conectada + credenciales (Vault).
  const { data: ctx } = await admin.rpc("payment_gateway_context", { p_restaurant_id: table.restaurant_id });
  if (!ctx || ctx.status !== "connected" || ctx.active === false || !ctx.provider) {
    return reply(409, { error: "Este restaurante no tiene pagos en línea habilitados" });
  }
  let credentials: Record<string, unknown> = {};
  if (typeof ctx.credentials === "string" && ctx.credentials) {
    try {
      credentials = JSON.parse(ctx.credentials);
    } catch {
      return reply(500, { error: "Credenciales de la pasarela corruptas" });
    }
  }

  // 3) Total de la mesa, server-side (pedidos activos 1/2/3).
  const { data: orders, error: ordErr } = await admin
    .from("orders")
    .select("id, total")
    .eq("table_id", table.table_id)
    .in("status_id", [1, 2, 3]);
  if (ordErr) return reply(500, { error: "No se pudo calcular la cuenta" });
  if (!orders || orders.length === 0) return reply(409, { error: "La mesa no tiene pedidos activos" });

  const orderIds = orders.map((o: { id: number }) => o.id);
  const amount = orders.reduce((sum: number, o: { total: number | null }) => sum + (o.total ?? 0), 0);
  if (amount <= 0) return reply(409, { error: "La cuenta de la mesa está en $0" });

  // 4) Anti doble-cobro: si hay un pago online en curso muy reciente, frenar.
  const { data: inflight } = await admin
    .from("payments")
    .select("id")
    .eq("table_id", table.table_id)
    .eq("method", "online")
    .in("status", ["pending", "authorized"])
    .gte("created_at", new Date(Date.now() - 90_000).toISOString())
    .limit(1);
  if (inflight && inflight.length > 0) {
    return reply(429, { error: "Ya hay un pago en curso para esta mesa. Esperá un momento e intentá de nuevo." });
  }

  // 5) Registrar el pago (pending) para tener referencia estable.
  const { data: payRow, error: payErr } = await admin
    .from("payments")
    .insert({
      restaurant_id: table.restaurant_id,
      table_id: table.table_id,
      order_ids: orderIds,
      provider: ctx.provider,
      method: "online",
      amount,
      tip,
      currency: "CLP",
      status: "pending",
      payer_email: payerEmail || null,
    })
    .select("id")
    .single();
  if (payErr || !payRow) return reply(500, { error: "No se pudo registrar el pago" });

  const paymentId = payRow.id as number;
  const reference = `MESA-P${paymentId}`;
  const returnUrl = `${url}/functions/v1/payment-return?provider=${ctx.provider}&pid=${paymentId}&r=${encodeURIComponent(qrToken)}`;

  // 6) Crear el cobro en la pasarela.
  const adapter = getPaymentAdapter(ctx.provider);
  const charge = await adapter.createCharge(
    {
      amount,
      tip,
      currency: "CLP",
      description: `Cuenta mesa ${table.table_number}`,
      reference,
      payerEmail: payerEmail || null,
      returnUrl,
    },
    credentials
  );

  if (charge.status === "failed" || !charge.checkoutUrl) {
    await admin.from("payments").update({ status: "failed" }).eq("id", paymentId);
    return reply(502, { error: charge.error ?? "La pasarela rechazó el cobro" });
  }

  if (charge.providerPaymentId) {
    await admin.from("payments").update({ provider_payment_id: charge.providerPaymentId }).eq("id", paymentId);
  }

  return reply(200, { checkoutUrl: charge.checkoutUrl, paymentId });
});
