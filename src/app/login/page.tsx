"use client"

import { useLogin } from "@/hooks/useLogin"

export default function LoginPage() {

  const {
    email,
    setEmail,

    password,
    setPassword,

    loading,
    error,

    login
  } = useLogin()

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">

        <h1 className="text-3xl font-bold text-white text-center mb-2">
          MESA
        </h1>

        <p className="text-zinc-400 text-center mb-8">
          Ingresa al panel de tu restaurante
        </p>

        <form
          onSubmit={login}
          className="space-y-5"
        >

          <div>
            <label className="block text-sm text-zinc-300 mb-2">
              Correo
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="tucorreo@gmail.com"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-white outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-2">
              Contraseña
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="********"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-white outline-none focus:border-orange-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 transition rounded-xl py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? "Ingresando..."
              : "Ingresar"}
          </button>

        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          ¿No tienes cuenta?{" "}
          <a
            href="/register"
            className="text-orange-500 hover:text-orange-400"
          >
            Registra tu restaurante
          </a>
        </p>

      </div>
    </main>
  )
}