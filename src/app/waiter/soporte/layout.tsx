import { ModuleGate } from "@/components/ModuleGate"
import { WaiterPortalShell } from "@/components/waiter/WaiterPortalShell"

export default function WaiterSoporteLayout({ children }: { children: React.ReactNode }) {
  return (
    <WaiterPortalShell>
      <ModuleGate area="waiter">{children}</ModuleGate>
    </WaiterPortalShell>
  )
}
