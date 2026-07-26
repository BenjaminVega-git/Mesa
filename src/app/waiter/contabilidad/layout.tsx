import { ModuleGate } from "@/components/ModuleGate"

export default function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate area="waiter">{children}</ModuleGate>
}
