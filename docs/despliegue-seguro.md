# Despliegue seguro de Mesa en Railway

## Qué protege esta configuración

- Railway ejecuta `npm run deploy:verify`, que debe superar lint y el build de
  producción antes de iniciar el servicio.
- GitHub Actions repite esa validación en cada pull request y push a `main`.
- CI arranca el servidor generado y consulta `/api/health`; así se detectan
  errores que solo aparecen al iniciar la aplicación.
- Railway consulta `/api/health` antes de activar la nueva versión. Si el
  build o el healthcheck fallan, la nueva versión no debe recibir tráfico y se
  conserva la versión activa anterior.
- `sw.js` y `admin-sw.js` no quedan cacheados por navegadores o proxies. El
  panel admin siempre obtiene la versión actual y la PWA del mesero puede
  detectar la actualización.

## Flujo recomendado

1. Trabajar en una rama y abrir un Pull Request.
2. Esperar a que CI termine en verde.
3. Revisar el deployment de Railway con un login, un pedido de prueba y la
   impresión si el cambio la afecta.
4. Fusionar a `main`.
5. Comprobar `https://tumesaqr.com/api/health` y verificar que responde
   `ok: true` antes de avisar a los clientes.

Si el build falla, los clientes deben seguir en el deployment anterior. El
error debe corregirse en una nueva rama/commit; no se deben aplicar cambios
directamente sobre la producción.

Railway no debe ejecutar migraciones automáticamente en el arranque. Las
migraciones de Supabase siguen siendo un paso separado: revisar primero
`supabase/migrations` y ejecutar `npx supabase db push` solo cuando se decida
afectar la base remota enlazada.

## Configuración de Railway

La configuración versionada está en `railway.json`. En el servicio `Mesa`, la
raíz debe ser el directorio del proyecto. Las variables de entorno se
configuran en Railway; no se guardan secretos en el repositorio.

El healthcheck se ejecuta durante el despliegue de una versión. Para monitoreo
continuo se necesita un monitor externo.
