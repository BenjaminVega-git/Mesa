"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { clearUserScopedCache } from "@/lib/session-cache"
import { useRestaurant } from "@/hooks/useRestaurant"
import { useStaffProfile } from "@/hooks/useStaffProfile"
import { useVisibleModules } from "@/hooks/useVisibleModules"
import { getStaffRoleLabel } from "@/lib/waiter-session"

const COLLAPSE_KEY = "waiter-sidebar-collapsed"

type Tab = {
  label: string
  href: string
  icon: React.ReactNode
}

/**
 * Navegación del portal de meseros — mismo patrón que AdminSidebar (aside
 * fijo, colapsable, CSS var para el margen del <main>, tabs por módulo
 * visible, identidad + logout al final). Antes cada página de mesero repetía
 * su propio header suelto sin un shell compartido.
 */
export function WaiterSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { restaurant, loading: loadingRestaurant } = useRestaurant()
  const { profile, loading: loadingProfile } = useStaffProfile()
  const { isVisible } = useVisibleModules()

  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage al montar
    if (stored === "1") setCollapsed(true)
    setHydrated(true)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty("--waiter-sidebar-w", collapsed ? "4rem" : "15rem")
    return () => {
      document.documentElement.style.removeProperty("--waiter-sidebar-w")
    }
  }, [collapsed])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      return next
    })
  }

  async function handleLogout() {
    supabase.removeAllChannels()
    clearUserScopedCache()
    await supabase.auth.signOut({ scope: "local" })
    router.replace("/waiter/login")
  }

  const tabs: Tab[] = [
    {
      label: "Pedidos en vivo",
      href: "/waiter/control",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    ...(isVisible("waiter", "contabilidad")
      ? [
          {
            label: "Contabilidad",
            href: "/waiter/contabilidad",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            ),
          },
        ]
      : []),
    ...(isVisible("waiter", "soporte")
      ? [
          {
            label: "Soporte",
            href: "/waiter/soporte",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-6 0a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
          },
        ]
      : []),
  ]

  const width = collapsed ? "w-16" : "w-60"

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen ${width} flex-col border-r border-stone-200 bg-white transition-[width] duration-200 ${hydrated ? "" : "invisible"}`}
    >
      <div className={`flex items-center gap-2.5 px-4 py-4 ${collapsed ? "justify-center px-0" : ""}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-xl font-bold text-orange-600 shadow-inner">
          M
        </span>
        {!collapsed && (
          <div className="min-w-0">
            {loadingRestaurant ? (
              <div className="h-3.5 w-24 animate-pulse rounded bg-stone-100" />
            ) : (
              <p className="truncate text-sm font-bold text-stone-900">
                {restaurant?.restaurant_name ?? "Portal meseros"}
              </p>
            )}
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              En turno
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        className="mx-3 mt-1 flex h-8 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
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

      <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-3">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              title={collapsed ? tab.label : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                collapsed ? "justify-center" : ""
              } ${
                active
                  ? "bg-stone-900 text-white shadow-sm"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              {tab.icon}
              {!collapsed && <span className="truncate">{tab.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-stone-100 p-3">
        {!collapsed && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2">
            {loadingProfile || !profile ? (
              <div className="h-7 w-7 animate-pulse rounded-full bg-stone-200" />
            ) : (
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr ${profile.avatar_color} text-[10px] font-bold text-white`}
              >
                {profile.name.substring(0, 2).toUpperCase()}
              </span>
            )}
            {profile && (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-stone-900">{profile.name}</p>
                <p className="text-[10px] text-stone-400">{getStaffRoleLabel(profile.role)}</p>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  )
}
