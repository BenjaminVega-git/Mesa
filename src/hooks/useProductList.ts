import { useState } from "react"
import { logger } from "@/lib/logger"
import { useProducts } from "@/hooks/useProducts"
import { useDeleteProduct } from "@/hooks/useDeleteProduct"
import { updateProductStatusAction } from "@/app/actions/product-actions"

const statusNames: Record<number, string> = {
  1: "Disponible",
  2: "Agotado",
  3: "Deshabilitado",
}

type UseProductListOptions = {
  page?: number
  pageSize?: number
  search?: string
}

export function useProductList({ page = 1, pageSize = 12, search = "" }: UseProductListOptions = {}) {
  const { products, total, loading, error, refresh } = useProducts({ page, pageSize, search })
  const {
    deleteProduct,
    loading: deleting,
    error: deleteError,
    dialog: deleteDialog,
  } = useDeleteProduct()

  const [statusOverrides, setStatusOverrides] = useState<Record<number, {
    status_id: number
    status_name: string
  }>>({})
  const [deletedProductIds, setDeletedProductIds] = useState<number[]>([])
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null)
  const [statusError, setStatusError] = useState("")

  const visibleProducts = products
    .filter((product) => !deletedProductIds.includes(product.id))
    .map((product) => {
      const statusOverride = statusOverrides[product.id]

      if (!statusOverride) return product

      return {
        ...product,
        status_id: statusOverride.status_id,
        product_status: {
          id: statusOverride.status_id,
          status_name: statusOverride.status_name,
        },
      }
    })

  const optimisticDeletedCount = products.filter((product) =>
    deletedProductIds.includes(product.id)
  ).length
  const totalVisibleProducts = Math.max(0, total - optimisticDeletedCount)

  async function deleteVisibleProduct(productId: number) {
    const success = await deleteProduct(productId)

    if (success) {
      setDeletedProductIds((prev) =>
        prev.includes(productId) ? prev : [...prev, productId]
      )
      refresh()
    }

    return success
  }

  async function updateProductStatus(productId: number, nextStatusId: number) {
    if (updatingStatusId) return false

    try {
      setUpdatingStatusId(productId)
      setStatusError("")

      const result = await updateProductStatusAction({
        productId,
        statusId: nextStatusId,
      })

      if (!result.ok) {
        throw new Error(result.error)
      }

      setStatusOverrides((currentOverrides) => ({
        ...currentOverrides,
        [productId]: {
          status_id: nextStatusId,
          status_name: statusNames[nextStatusId] ?? "",
        },
      }))

      return true
    } catch (err: unknown) {
      logger.error("Error actualizando estado de producto", err)
      setStatusError(err instanceof Error ? err.message : "Error al actualizar estado")
      return false
    } finally {
      setUpdatingStatusId(null)
    }
  }

  return {
    products: visibleProducts,
    totalProducts: totalVisibleProducts,
    totalPages: Math.max(1, Math.ceil(totalVisibleProducts / pageSize)),
    loading,
    deleting,
    updatingStatusId,
    error: error || deleteError || statusError,
    deleteProduct: deleteVisibleProduct,
    updateProductStatus,
    deleteDialog,
    refresh,
  }
}