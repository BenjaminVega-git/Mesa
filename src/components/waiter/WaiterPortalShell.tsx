import { WaiterSidebar } from "@/components/waiter/WaiterSidebar"

/**
 * Shell del portal de meseros — mismo patrón que admin/layout.tsx (sidebar
 * fijo + <main> con margen dinámico vía CSS var). Cada página de mesero
 * mantiene su propio layout.tsx (no hay un único src/app/waiter/layout.tsx)
 * porque /waiter/login y /waiter/busy quedan fuera del portal a propósito.
 */
export function WaiterPortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <WaiterSidebar />
      <main
        style={{ marginLeft: "var(--waiter-sidebar-w, 15rem)" }}
        className="min-h-screen px-4 py-6 transition-[margin-left] duration-200 sm:px-6 lg:px-8"
      >
        {children}
      </main>
    </div>
  )
}
