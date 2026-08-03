// Edge Function: payment-webhook
// Endpoint público que reciben las pasarelas de pago para notificar el estado
// de un cobro. verify_jwt=false porque el que llama es la pasarela (no envía
// nuestro JWT); la autenticidad se valida por adaptador:
//  - Mercado Pago: firma HMAC x-signature (clave secreta del restaurante).
//  - Flow: re-consulta getStatus firmada (el POST de Flow no trae firma).
//  - Transbank: NO usa webhooks (confirma payment-return).
//
// Acepta GET y POST. Esto NO es cosmético: Mercado Pago llama esta misma URL
// con GET tanto (a) al guardar la URL en Webhooks → Configurar notificaciones
// (ping de validación sin body, MP marca la URL como inválida si no responde
// 200) como (b) para el IPN clásico de algunos eventos. Rechazar GET con 405
// —el bug real que traía este archivo— hacía que MP invalidara la
// configuración del webhook y que ninguna notificación real se procesara
// nunca (confirmado: cero filas en payment_events pese a intentos de cobro
// reales), aunque createCharge funcionara perfecto.
//
// Hace dos cosas, en orden:
//  1) Registra el evento crudo (trazabilidad; idempotente por
//     unique(source, external_id)). SIEMPRE, aunque la conciliación falle.
//  2) CONCILIA: las URLs de notificación creadas por MESA llevan
//     &ref=MESA-P{paymentId} → se resuelve el pago, se validan las
//     credenciales del restaurante (Vault) y se asienta el resultado vía
//     payment_apply_gateway_result (marca pedidos pagados y libera la mesa).
//     Un ping de validación (sin ref) simplemente no concilia nada y responde
//     200 igual — es justo lo que MP necesita ver para aceptar la URL.
//
// Responde 200 rápido (MP espera <22 s, Flow <15 s).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaymentAdapter } from "../_shared/payment-adapters.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return new Response("config", { status: 500 });

  const reqUrl = new URL(req.url);
  const query = Object.fromEntries(reqUrl.searchParams.entries());
  const provider = query.provider ?? "unknown";
  const rawBody = await req.text();
  const contentType = req.headers.get("content-type") ?? "";
  const headers = Object.fromEntries(req.headers.entries());

  let payload: Record<string, unknown>;
  let externalId: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    // Flow: form-urlencoded con `token`.
    const form = new URLSearchParams(rawBody);
    payload = Object.fromEntries(form.entries());
    externalId = form.get("token");
  } else {
    try {
      payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    } catch {
      payload = { raw: rawBody };
    }
    // Mercado Pago manda el id del pago en query (?data.id=) y en data.id.
    const data = payload.data as Record<string, unknown> | undefined;
    externalId =
      query["data.id"] ??
      ((data?.id ?? payload.providerPaymentId ?? payload.payment_id ?? payload.token ?? payload.id ?? null) as
        | string
        | null);
    if (externalId != null) externalId = String(externalId);
  }

  const admin = createClient(url, svc);

  // 1) Registrar el evento crudo (con query + headers de firma).
  await admin.rpc("payment_record_event", {
    p_source: provider,
    p_external_id: externalId,
    p_payload: {
      query,
      headers: {
        "x-signature": req.headers.get("x-signature"),
        "x-request-id": req.headers.get("x-request-id"),
        "content-type": contentType,
      },
      body: payload,
    },
  });

  // 2) Conciliar (best-effort; el 200 no depende de esto).
  try {
    const refMatch = /^MESA-P(\d+)$/.exec(query.ref ?? "");
    if (refMatch && (provider === "flow" || provider === "mercadopago")) {
      const paymentId = Number.parseInt(refMatch[1], 10);
      const { data: pay } = await admin
        .from("payments")
        .select("id, restaurant_id, provider, status")
        .eq("id", paymentId)
        .maybeSingle();

      if (pay && pay.provider === provider && pay.status !== "paid" && pay.status !== "refunded") {
        const { data: ctx } = await admin.rpc("payment_gateway_context", {
          p_restaurant_id: pay.restaurant_id,
        });
        let credentials: Record<string, unknown> = {};
        if (ctx && typeof ctx.credentials === "string" && ctx.credentials) {
          try {
            credentials = JSON.parse(ctx.credentials);
          } catch {
            credentials = {};
          }
        }

        const adapter = getPaymentAdapter(provider);
        const result = await adapter.parseWebhook(headers, rawBody, credentials, query);
        if (result.valid && result.status) {
          await admin.rpc("payment_apply_gateway_result", {
            p_payment_id: paymentId,
            p_status: result.status,
            p_provider_payment_id: result.providerPaymentId ?? null,
          });
        }
      }
    }
  } catch {
    // La conciliación nunca tumba el 200: el evento quedó registrado y el
    // retorno del pagador / una re-consulta resuelven el estado.
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
