import type { Metadata } from "next"
import { AdminGuard } from "./AdminGuard"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { OnboardingModal } from "@/components/admin/OnboardingModal"
import { AdminPushRegister } from "@/components/admin/AdminPushRegister"
import { AdminPrinterListener } from "@/components/admin/AdminPrinterListener"
import { AdminSessionTimeout } from "@/components/admin/AdminSessionTimeout"
import { AssistantWidget } from "@/components/admin/assistant/AssistantWidget"
import { ModuleGate } from "@/components/ModuleGate"

export const metadata: Metadata = {
  title: "Administración",
  // PWA del admin: sustituye al manifest del mesero (raíz) en todo /admin, para
  // que "Instalar app" instale el panel (start_url /admin), no el del mesero.
  manifest: "/manifest-admin.webmanifest",
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-stone-50 text-stone-950">
        <AdminSidebar />
        <main
          style={{ marginLeft: "var(--sidebar-w, 15rem)" }}
          className="min-h-screen px-4 py-6 transition-[margin-left] duration-200 sm:px-6 lg:px-8"
        >
          <ModuleGate area="admin">{children}</ModuleGate>
        </main>
        <OnboardingModal />
        <AdminPushRegister />
        <AdminPrinterListener />
        <AdminSessionTimeout />
        <AssistantWidget />
      </div>
    </AdminGuard>
  )
}
