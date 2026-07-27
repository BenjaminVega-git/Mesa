"use client"

import Link from "next/link"
import { useLogin } from "@/hooks/useLogin"

export default function LoginPage() {
  const {
    email,
    setEmail,

    password,
    setPassword,

    loading,
    error,

    login,
  } = useLogin()

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center">
        <section className="grid w-full gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
          <div className="flex flex-col justify-between rounded-[2rem] bg-stone-950 p-6 text-white shadow-2xl shadow-stone-900/15 sm:p-8">
            <div>
              <Link href="/" className="inline-flex items-center gap-3" aria-label="MESA inicio">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-sm font-bold text-white shadow-lg shadow-orange-500/25">
                  M
                </span>
                <span className="text-lg font-semibold tracking-tight">MESA</span>
              </Link>

              <div className="mt-10 max-w-md">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-300">
                  Panel administrador
                </p>
                <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
                  Vuelve a gestionar tu restaurante.
                </h1>
                <p className="mt-5 text-sm leading-6 text-stone-300 sm:text-base">
                  Accede a categorías, productos, mesas y pedidos desde una experiencia clara para el día a día.
                </p>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <p className="text-xl font-bold tabular-nums">18</p>
                <p className="mt-1 text-stone-300">Pedidos</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <p className="text-xl font-bold tabular-nums">16</p>
                <p className="mt-1 text-stone-300">Mesas</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <p className="text-xl font-bold tabular-nums">42</p>
                <p className="mt-1 text-stone-300">Productos</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 sm:p-8">
            <div className="mb-8">
              <p className="text-sm text-stone-600">Bienvenido de vuelta</p>
              <h2 className="mt-1 text-3xl font-bold tracking-tight">
                Iniciar sesión
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">
                Ingresa al panel de tu restaurante con tu correo y contraseña.
              </p>
            </div>

            <form onSubmit={login} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-700">
                  Correo
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@gmail.com"
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-semibold text-stone-700">
                    Contraseña
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-semibold text-orange-600 transition hover:text-orange-700"
                  >
                    ¿La olvidaste?
                  </Link>
                </div>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100"
                />
              </div>

              {error && (
                <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 hover:shadow-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-stone-600">
              ¿No tienes cuenta? Contacta a tu administrador para que te dé acceso.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
