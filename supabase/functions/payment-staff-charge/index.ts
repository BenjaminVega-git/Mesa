// Edge Function: payment-staff-charge
// El STAFF (mesero o admin, autenticado) genera un cobro por pasarela para
// una mesa: devuelve el checkoutUrl que la UI muestra como QR para que el
// comensal lo escanee y pague desde su teléfono. Mismo circuito que
// payment-create-charge (el del comensal), pero la credencial es el JWT del
// staff (verify_jwt=true) y la mesa se valida contra SU restaurante.
// El monto NUNCA viene del cliente: se suma server-side.
//
// Entrada (POST JSON): { tableId, tip?, payerEmail?, dinerSlot?, orderIds? }
// orderIds: dividir cuenta — cobra exactamente ese conjunto de pedidos de la
// mesa (deben estar todos activos), en vez de la mesa completa o un comensal.
// Salida: { checkoutUrl, paymentId } | { error }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaymentAdapter } from "../_shared/payment-adapters.ts";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
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
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !svc || !anon) return reply(500, { error: "Configuración incompleta" });

  // 1) Identidad del staff desde su JWT.
  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return reply(401, { error: "No autorizado" });

  const admin = createClient(url, svc);
  const { data: staff } = await admin
    .from("users")
    .select("id, restaurant_id, role_id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!staff || ![1, 2].includes(staff.role_id) || !staff.restaurant_id) {
    return reply(403, { error: "Solo meseros o administradores pueden cobrar" });
  }

  let input: {
    tableId?: number;
    tip?: number;
    payerEmail?: string;
    dinerSlot?: number;
    orderIds?: number[];
  };
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "Body inválido" });
  }

  const tableId = Number(input.tableId);
  if (!Number.isFinite(tableId) || tableId <= 0) return reply(400, { error: "Mesa inválida" });

  const tip = Number.isFinite(input.tip) ? Math.max(0, Math.round(Number(input.tip))) : 0;
  if (tip > 1_000_000) return reply(400, { error: "Propina fuera de rango" });

  const payerEmail = typeof input.payerEmail === "string" ? input.payerEmail.trim().slice(0, 120) : "";
  if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    return reply(400, { error: "Email inválido" });
  }

  const dinerSlot = Number.isFinite(input.dinerSlot) ? Number(input.dinerSlot) : null;
  const requestedOrderIds =
    Array.isArray(input.orderIds) && input.orderIds.length > 0
      ? input.orderIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : null;
  if (Array.isArray(input.orderIds) && (!requestedOrderIds || requestedOrderIds.length !== input.orderIds.length)) {
    return reply(400, { error: "Selección de pedidos inválida" });
  }

  // 2) La mesa debe ser del restaurante del staff.
  const { data: table } = await admin
    .from("tables")
    .select("id, restaurant_id, table_number")
    .eq("id", tableId)
    .maybeSingle();
  if (!table || table.restaurant_id !== staff.restaurant_id) {
    return reply(404, { error: "Mesa no encontrada" });
  }

  // 3) Pasarela conectada + credenciales (Vault).
  const { data: ctx } = await admin.rpc("payment_gateway_context", { p_restaurant_id: table.restaurant_id });
  if (!ctx || ctx.status !== "connected" || ctx.active === false || !ctx.provider) {
    return reply(409, { error: "El restaurante no tiene pasarela de pagos conectada" });
  }
  let credentials: Record<string, unknown> = {};
  if (typeof ctx.credentials === "string" && ctx.credentials) {
    try {
      credentials = JSON.parse(ctx.credentials);
    } catch {
      return reply(500, { error: "Credenciales de la pasarela corruptas" });
    }
  }

  // 4) Total server-side de los pedidos activos (mesa, comensal, o el
  // conjunto explícito de "dividir cuenta").
  let query = admin
    .from("orders")
    .select("id, total")
    .eq("table_id", table.id)
    .in("status_id", [1, 2, 3]);
  if (requestedOrderIds) query = query.in("id", requestedOrderIds);
  else if (dinerSlot != null) query = query.eq("diner_slot", dinerSlot);
  const { data: orders, error: ordErr } = await query;
  if (ordErr) return reply(500, { error: "No se pudo calcular la cuenta" });
  if (!orders || orders.length === 0) return reply(409, { error: "La mesa no tiene pedidos activos" });
  if (requestedOrderIds && orders.length !== requestedOrderIds.length) {
    return reply(409, { error: "Algunos pedidos de la selección ya no están activos" });
  }

  const orderIds = orders.map((o: { id: number }) => o.id);
  const amount = orders.reduce((sum: number, o: { total: number | null }) => sum + (o.total ?? 0), 0);
  if (amount <= 0) return reply(409, { error: "La cuenta de la mesa está en $0" });

  // 5) Anti doble-cobro (mismo criterio que el flujo del comensal).
  const { data: inflight } = await admin
    .from("payments")
    .select("id")
    .eq("table_id", table.id)
    .eq("method", "online")
    .in("status", ["pending", "authorized"])
    .gte("created_at", new Date(Date.now() - 90_000).toISOString())
    .limit(1);
  if (inflight && inflight.length > 0) {
    return reply(429, { error: "Ya hay un pago en curso para esta mesa. Espera un momento e intenta de nuevo." });
  }

  // 6) Registrar el pago (pending) para tener referencia estable.
  const { data: payRow, error: payErr } = await admin
    .from("payments")
    .insert({
      restaurant_id: table.restaurant_id,
      table_id: table.id,
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
  const returnUrl = `${url}/functions/v1/payment-return?provider=${ctx.provider}&pid=${paymentId}`;

  // 7) Crear el cobro en la pasarela.
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
