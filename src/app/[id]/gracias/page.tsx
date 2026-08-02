import { notFound } from "next/navigation"
import { getMenuData } from "@/lib/menu/get-menu-data"
import { ClearDinerTokenOnMount } from "./clear-token"

export const revalidate = 300

export default async function GraciasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let menu
  try {
    menu = await getMenuData(id)
  } catch {
    notFound()
  }

  const name = menu.restaurant?.restaurant_name ?? "el restaurante"

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0b] [font-family:var(--font-manrope)]">
      <ClearDinerTokenOnMount tableId={menu.tableId ?? null} />

      <section className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center md:max-w-2xl">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#161618] text-5xl shadow-[0_10px_30px_rgba(0,0,0,0.4)] ring-1 ring-[#27272a]">
          ✨
        </div>

        <h1 className="mt-8 text-4xl font-black tracking-tight text-[#fafafa]">
          ¡Gracias por venir!
        </h1>

        <p className="mt-4 max-w-md text-base leading-relaxed text-[#a1a1aa]">
          Esperamos que hayas disfrutado tu visita a <strong className="text-[#fafafa]">{name}</strong>.
          Vuelve pronto.
        </p>

      </section>
    </main>
  )
}
