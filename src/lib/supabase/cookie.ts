// El nombre por defecto de @supabase/ssr depende del hostname de la URL.
// Como el navegador usa el proxy bajo Tailscale y el servidor conecta a
// Supabase local por 127.0.0.1, debe ser explícito y común a ambos lados.
export const SUPABASE_AUTH_COOKIE = "mesa-auth-token"
