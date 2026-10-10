# Recorrido frontend → API real local

14 comprobaciones correctas contra el backend integrado `e5eac050b17ec7e389d5ec6a6263afa124773690`, además del recorrido previo de 12 contra `133bca73`. Datos exclusivamente sintéticos, SQLite temporal propia, `APP_ENV=testing`, host `127.0.0.1`. No se modificó `.env`, storage ni caches de la aplicación: todos los archivos de ejecución fueron a TEMP. El arnés rechaza una DB distinta de `synthetic.sqlite` en su directorio temporal y rehúsa migrar una DB no vacía.

El navegador usa frontend y proxy HTTPS locales con certificado efímero, porque testing emite la cookie con Secure. El proxy transporta las peticiones/respuestas del PHP server sin cambiar contenido ni autorización. `Http::preventStrayRequests()` bloquea HTTP externo en Laravel; Playwright aborta cualquier host distinto de loopback. Solo el proveedor de cotización de paquetería devuelve una tarifa sintética ($30); precios de productos, tarifa local ($40, fixture DB), tokens firmados, controllers, cookies, consentimiento, stock, pedidos, avisos y Operación usan implementación real. Ningún label se compra.

`http-results.json`, `http-run.txt` y las tres capturas HTTP contienen la evidencia. Resultado final: 8 WebOrders, 8 CommerceOrders, 8 avisos lógicos; 0 ventas, 0 guías. Los cookies/tokens privados no se exportan.

- Escenario 1: primer decant, consentimiento afirmativo explícito, $150 + $40, aviso al responsable Sales y WhatsApp canónico con fecha absoluta, sin folio en el mensaje.
- Escenario 2: cookie HttpOnly/SameSite=Lax, dirección ofrecida pero vacía hasta elegir reutilizar.
- Escenario 3: dirección temporal nueva, consentimiento negativo, dirección anterior conservada.
- Escenario 4: 10/10/2026, 1–4 pm solicitado llega a la tarjeta canónica de Operación, sin confirmar cita.
- Escenario 5: reloj avanza a 15:30, selección 1–4 pm devuelve 422 sin nuevo pedido/reserva/aviso; carrito/dirección/token siguen presentes y nueva selección permite continuar.
- Replay no duplica pedido, reserva ni aviso; guest con el mismo teléfono o replay sin cookie sigue 401 y su pedido futuro devuelve 404 al primer navegador.
- Dos perfumes ignoran los precios enviados ($1) y usan $350 de mercancía + $30 nacional firmado.
- La última unidad reservada desaparece del catálogo real; otro intento devuelve 422.
- Cambiar a un Cliente existente en dispositivo compartido revoca la cookie presentada y no inicia sesión por teléfono. Cookie de otro tenant y cookie caducada devuelven 401.
- Origin local en testing devuelve 403 al olvidar dirección, conservando consentimiento; petición HTTP con Origin oficial y cookie válida revoca consentimiento sin borrar snapshot histórico.

Reproducir desde este repo, con PHP/vendor preparados en el backend:

```powershell
$env:QA_BACKEND_ROOT = 'C:\ruta\backend-local'
$env:QA_PHP = 'C:\ruta\php.exe'
$env:PLAYWRIGHT_MODULE = 'C:\ruta\node_modules\playwright'
$env:QA_OPENSSL = 'C:\ruta\openssl.exe' # opcional; Git for Windows por defecto
node scripts/qa-operational-http.cjs
```

El arnés muestra su directorio TEMP y cierra sus propios servidores. Las claves/certificado y SQLite temporales nunca se versionan. Limitaciones: carrier sintético; push sin suscripción produce aviso in-app `skipped`, sin prueba de transporte; no confirmación de pago/venta ni contención MySQL en este recorrido. El borrado autorizado usa HTTP context request con el Origin oficial porque testing debe rechazar el Origin local; éxito/fallo del flujo UI de borrado también tiene regresiones frontend. Safari iOS físico sigue pendiente.
