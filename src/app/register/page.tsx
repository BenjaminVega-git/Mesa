"use client"

import Link from "next/link"
import { useRegisterRestaurant } from "@/hooks/useRegisterRestaurant"

export default function RegisterPage() {

  const {
    restaurantName,
    setRestaurantName,

    adminName,
    setAdminName,

    email,
    setEmail,

    password,
    setPassword,

    loading,
    error,

    registerRestaurant
  } = useRegisterRestaurant()

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">

        <h1 className="text-3xl font-bold text-white text-center mb-2">
          MESA
        </h1>

        <p className="text-zinc-400 text-center mb-8">
          Crea tu restaurante en minutos
        </p>

        <form
          onSubmit={registerRestaurant}
          className="space-y-5"
        >

          <div>
            <label className="block text-sm text-zinc-300 mb-2">
              Nombre del restaurante
            </label>

            <input
              type="text"
              required
              disabled={loading}
              value={restaurantName}
              onChange={(e) =>
                setRestaurantName(e.target.value)
              }
              placeholder="Ej: Pizzería Roma"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-white outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2">
              Nombre del administrador
            </label>

            <input
              type="text"
              required
              disabled={loading}
              value={adminName}
              onChange={(e) =>
                setAdminName(e.target.value)
              }
              placeholder="Ingresa tu nombre"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-white outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2">
              Correo
            </label>

            <input
              type="email"
              required
              disabled={loading}
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="tucorreo@gmail.com"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-white outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2">
              Contraseña
            </label>

            <input
              type="password"
              required
              minLength={6}
              disabled={loading}
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="••••••••"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-white outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 transition rounded-xl py-3 font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? "Creando restaurante..."
              : "Crear restaurante"}
          </button>

          <p className="text-sm text-zinc-500 text-center">
            ¿Ya tienes cuenta?{" "}

            <Link
              href="/login"
              className="text-orange-500 hover:text-orange-400"
            >
              Inicia sesión
            </Link>

          </p>

        </form>
      </div>
    </main>
  )
}