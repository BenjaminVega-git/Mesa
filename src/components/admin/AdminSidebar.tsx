"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { clearUserScopedCache } from "@/lib/session-cache"
import { useRestaurant } from "@/hooks/useRestaurant"
import { useTableList } from "@/hooks/useTableList"
import { useOrderList } from "@/hooks/useOrderList"
import { useProductList } from "@/hooks/useProductList"
import { useCategoryList } from "@/hooks/useCategoryList"
import { useWaiters } from "@/hooks/useWaiters"
import { useMyPlan } from "@/hooks/useMyPlan"
import { useVisibleModules } from "@/hooks/useVisibleModules"
import { useInventoryAlerts } from "@/hooks/useInventoryAlerts"
import { InventoryAlertBell } from "@/components/admin/InventoryAlertBell"
import { BranchSwitcher } from "@/components/admin/BranchSwitcher"
import { ADMIN_MODULE_BY_ROUTE } from "@/lib/module-visibility"

const COLLAPSE_KEY = "admin-sidebar-collapsed"

type Tab = {
  label: string
  href: string
  badge?: string
  // Tono del badge: rojo/ámbar para alertas (inventario); naranja por defecto.
  badgeTone?: "red" | "amber"
  icon: React.ReactNode
}

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { restaurant, loading: loadingRestaurant } = useRestaurant()
  const { totalTables, loading: loadingTables } = useTableList()
  const { totalProducts, loading: loadingProducts } = useProductList()
  const { totalCategories, loading: loadingCategories } = useCategoryList()
  const { activeOrdersCount, loading: loadingOrders } = useOrderList({ limit: 50 })
  const { waiters, loading: loadingWaiters } = useWaiters()
  const { plan } = useMyPlan()
  const { isVisible } = useVisibleModules()
  const {
    outCount: invOut,
    lowCount: invLow,
    totalCount: invAlertCount,
    items: invAlertItems,
    loading: invAlertLoading,
  } = useInventoryAlerts()

  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage al montar
    if (stored === "1") setCollapsed(true)
    setHydrated(true)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-w",
      collapsed ? "4rem" : "15rem"
    )
    return () => {
      document.documentElement.style.removeProperty("--sidebar-w")
    }
  }, [collapsed])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      } catch {}
      return next
    })
  }

  const formatBadge = (loading: boolean, value: number) => (loading ? "..." : String(value))

  async function handleSignOut() {
    supabase.removeAllChannels()
    clearUserScopedCache()
    await supabase.auth.signOut({ scope: "local" })
    router.replace("/login")
  }

  const tabs: Tab[] = [
    {
      label: "Resumen",
      href: "/admin",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      ),
    },
    {
      label: "Categorías",
      href: "/admin/categories",
      badge: formatBadge(loadingCategories, totalCategories),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: "Productos",
      href: "/admin/products",
      badge: formatBadge(loadingProducts, totalProducts),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      // Subsección de Productos, togglable por el operador (platform_modules).
      label: "Promociones",
      href: "/admin/promociones",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
    },
    {
      // Subsección de Productos (cupones), togglable por el operador.
      label: "Descuentos",
      href: "/admin/descuentos",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6M9.5 9h.01M14.5 15h.01M6 4h12a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3a2 2 0 000-4V6a2 2 0 012-2z" />
        </svg>
      ),
    },
    {
      label: "Inventario",
      href: "/admin/inventory",
      // Solo mostramos badge cuando hay alertas (rojo si hay agotados, ámbar si
      // solo hay stock bajo). Nada de "..." mientras carga, para no meter ruido.
      badge: !invAlertLoading && invAlertCount > 0 ? String(invAlertCount) : undefined,
      badgeTone: invOut > 0 ? "red" : "amber",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: "Mesas",
      href: "/admin/tables",
      badge: formatBadge(loadingTables, totalTables),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
    },
    ...(restaurant?.reservation_contact_type && restaurant.reservation_contact_type !== "none"
      ? [
          {
            label: "Reservas",
            href: "/admin/reservations",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ),
          },
        ]
      : []),
    {
      label: "Pedidos",
      href: "/admin/orders",
      badge: formatBadge(loadingOrders, activeOrdersCount),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      label: "Meseros",
      href: "/admin/waiters",
      badge: formatBadge(loadingWaiters, waiters.length),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      label: "Reportes",
      href: "/admin/reports",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    ...(restaurant?.output_mode === "printer"
      ? [
          {
            label: "Impresora",
            href: "/admin/printer",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            ),
          },
        ]
      : restaurant?.output_mode === "screen"
      ? [
          {
            label: "Pantalla",
            href: "/screen",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
            ),
          },
        ]
      : []),
    {
      label: "Ajustes",
      href: "/admin/settings",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: "Mi plan",
      href: "/admin/plan",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: "Pagos",
      href: "/admin/pagos",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: "Caja",
      href: "/admin/caja",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2m0-8V6m0 2c1.66 0 3 .9 3 2M12 16v2m-7-6a7 7 0 1 0 14 0 7 7 0 1 0-14 0z" />
        </svg>
      ),
    },
    {
      label: "API",
      href: "/admin/api",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
    },
    {
      label: "Soporte",
      href: "/admin/soporte",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-6 0a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      // Módulo "instalar" en platform_modules → el operador lo puede
      // encender/apagar por cliente desde el portal (ADMIN_MODULE_BY_ROUTE).
      label: "Instalar app",
      href: "/admin/instalar",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
      ),
    },
    ...(plan?.has_multi_branch && plan?.is_owner
      ? [
          {
            label: "Sucursales",
            href: "/admin/sucursales",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m4-14h10M7 11h10m-8 4h6" />
              </svg>
            ),
          },
        ]
      : []),
  ]

  const width = collapsed ? "w-16" : "w-60"

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen ${width} flex-col border-r border-stone-200 bg-white transition-[width] duration-200 ${
        hydrated ? "" : "invisible"
      }`}
    >
      {/* BRAND */}
      <div className={`flex items-center gap-3 border-b border-stone-100 px-3 py-4 ${collapsed ? "justify-center" : ""}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-xl font-bold shadow-inner">
          M
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-sm font-bold tracking-tight text-stone-900">
                {loadingRestaurant ? (
                  <span className="inline-block h-4 w-24 animate-pulse rounded bg-stone-200" />
                ) : (
                  restaurant?.restaurant_name ?? "Mi Restaurante"
                )}
              </h1>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            </div>
            <p className="truncate text-[10px] font-medium text-emerald-700">Abierto</p>
          </div>
        )}
        {!collapsed && isVisible("admin", "inventory") && (
          <InventoryAlertBell outCount={invOut} lowCount={invLow} items={invAlertItems} />
        )}
      </div>

      {/* SELECTOR DE LOCAL (solo el dueño; el admin de local queda fijo en su sucursal) */}
      {!collapsed && plan?.is_owner && <BranchSwitcher />}

      {/* TOGGLE */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        className="mx-3 mt-3 flex h-8 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
      >
        <svg
          className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* NAV */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {tabs.filter((tab) => {
          const moduleKey = ADMIN_MODULE_BY_ROUTE[tab.href]
          return !moduleKey || isVisible("admin", moduleKey)
        }).map((tab) => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              title={collapsed ? tab.label : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-stone-900 text-white shadow-sm"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <span className="relative shrink-0">
                {tab.icon}
                {/* Punto de alerta sobre el ícono cuando el menú está colapsado */}
                {collapsed && tab.badge !== undefined && tab.badgeTone && (
                  <span
                    className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-white ${
                      tab.badgeTone === "red" ? "bg-red-500" : "bg-amber-500"
                    }`}
                  />
                )}
              </span>
              {!collapsed && <span className="flex-1 truncate">{tab.label}</span>}
              {!collapsed && tab.badge !== undefined && (
                <span
                  className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                    tab.badgeTone === "red"
                      ? isActive
                        ? "bg-red-500 text-white"
                        : "bg-red-100 text-red-700"
                      : tab.badgeTone === "amber"
                      ? isActive
                        ? "bg-amber-500 text-white"
                        : "bg-amber-100 text-amber-700"
                      : isActive
                      ? "bg-orange-500 text-white"
                      : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </Link>
          )
        })}

        <button
          type="button"
          onClick={handleSignOut}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span className="flex-1 truncate text-left">Cerrar sesión</span>}
        </button>
      </nav>
    </aside>
  )
}
