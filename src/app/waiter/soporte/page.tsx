"use client"

import { SupportCenter } from "@/components/support/SupportCenter"

export default function WaiterSoportePage() {
  return (
    <div className="mx-auto max-w-4xl pb-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-stone-950">Soporte</h1>
      <p className="mt-1 text-sm text-stone-500">
        ¿Algo no funciona? Avísale al equipo MESA y sigue la respuesta aquí.
      </p>
      <div className="mt-6">
        <SupportCenter />
      </div>
    </div>
  )
}
