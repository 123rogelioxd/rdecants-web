# Cuenta del cliente: confirmación de salida, sin promesa de llegada

El backend #236 identifica `delivery.confirmed_window.window_type=departure`.
La lista y detalle de pedidos ahora dicen «Salida a reparto confirmada» y
explican que la llegada depende del recorrido. Una preferencia no confirmada
continúa separada; un snapshot anterior sin tipo conserva la etiqueta neutral
«Horario confirmado». Se escapan todas las etiquetas recibidas del backend.

Se reutilizan endpoints y sesión existentes. No se calcula horario, tarifa,
capacidad, estado de pago ni una promesa de llegada en JavaScript. El módulo
de cuenta tiene cache key nueva. No cambia checkout ni POS.

Parche pequeño que conserva draft #22 `f8445fc0` como su primer commit y su
worktree intacto. El nuevo draft #23 se dirige a `production` para ejecutar la
CI existente, limitada a PRs con esa base; contiene #22 y esta corrección.
Se comprobó remoto `production` en `5e89246a`; no hubo publicación. Integración
coordinada con backend #236 `d16945d4` después de SHA combinado, CI y autorización.
Revertir retira sólo presentación y cache key. Las flags y restricciones
económicas/operativas pertenecen al backend y no se activan desde la tienda.

Validación final: `npm test`: **1,159 casos, 1,158 PASS, una omisión heredada,
cero fallos**; `node --check assets/js/pages/account.js` y diff check pasan. Casos
prueban ambos recorridos, la preferencia separada, rechazo de `kind=requested`,
snapshot antiguo neutral y etiqueta maliciosa escapada. No se probó un courier
real ni Safari/iPhone físico ni un proveedor de pagos o WhatsApp externo.
