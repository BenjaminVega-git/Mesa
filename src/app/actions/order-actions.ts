"use server"

import {
  createOrder as createOrderService,
  listActiveOrdersForRestaurant as listActiveOrdersService,
  advanceOrderStatus as advanceOrderStatusService,
  markOrderAsPaid as markOrderAsPaidService,
  markTableOrdersAsPaid as markTableOrdersAsPaidService,
  reassignTable as reassignTableService,
  claimTable as claimTableService,
  cancelOrder as cancelOrderService,
  type CreatedOrder,
  type WaiterOrder,
} from "@/services/order-service"
import type { CreateOrderInput } from "@/lib/validation/order"
import { fail, type Result } from "@/services/result"
import { checkPublicOrderLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export async function createOrderAction(
  input: CreateOrderInput
): Promise<Result<CreatedOrder>> {

  try {
    const result = await checkPublicOrderLimit(input.qrToken)
    if (!result.success) {
      return fail("Estás haciendo pedidos demasiado rápido. Espera un momento e intenta de nuevo.")
    }
  } catch (err) {
      logger.error("Rate limit no disponible (Upstash)", err)
  }

  return createOrderService(input)
}

export async function listActiveOrdersAction(
  restaurantId: number
): Promise<Result<WaiterOrder[]>> {
  return listActiveOrdersService(restaurantId)
}

export async function advanceOrderStatusAction(
  orderId: number
): Promise<Result<{ id: number; statusId: number }>> {
  return advanceOrderStatusService(orderId)
}

export async function markOrderAsPaidAction(
  orderId: number
): Promise<Result<{ id: number; statusId: number; tableReleased: boolean }>> {
  return markOrderAsPaidService(orderId)
}

export async function markTableOrdersAsPaidAction(
  tableId: number,
  tip: number = 0
): Promise<Result<{ tableId: number; paidIds: number[]; tableReleased: boolean }>> {
  return markTableOrdersAsPaidService(tableId, tip)
}

export async function reassignTableAction(
  tableId: number,
  newWaiterId: number | null
): Promise<Result<{ tableId: number }>> {
  return reassignTableService(tableId, newWaiterId)
}

export async function claimTableAction(
  tableId: number
): Promise<Result<{ claimed: boolean }>> {
  return claimTableService(tableId)
}

export async function cancelOrderAction(
  orderId: number,
  reason?: string
): Promise<Result<{ id: number; statusId: number }>> {
  return cancelOrderService(orderId, reason)
}