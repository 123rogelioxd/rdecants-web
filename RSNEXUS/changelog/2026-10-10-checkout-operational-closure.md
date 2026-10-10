# Checkout operativo: recompra, consentimiento y horario

Base `production`: `4067f610`. Candidato, sin merge ni publicación. Backend
correspondiente: `r-supply-os`, rama `feat/operational-closure-web-api`.

El checkout ofrece reutilizar una dirección únicamente cuando la API devuelve
`address_saved:true` para la credential HttpOnly. Se permite otra dirección,
olvidar consentimiento o salir del dispositivo. El guardado requiere elección
afirmativa sin casilla preseleccionada; el contacto editado descarta el prefill.
No se guardan direcciones privadas en localStorage.

Una preferencia vencida devuelve422, vuelve a la selección y conserva carrito,
dirección y cotización. La API confirma importes y genera WhatsApp natural
con items, cantidades, presentación, total y fecha absoluta solicitada. La UI
no presenta una preferencia como compromiso ni envío pendiente como incluido.
Listados comerciales filtran sellability; fichas agotadas no permiten comprar.

Compatibilidad: `delivery.save_address` es opcional false por defecto y la UI
consulta `delivery/options.capabilities.saved_addresses`. API antigua permite
comprar sin ofrecer guardado. Backend nuevo acepta checkout antiguo sin
consentimiento implícito. `VERSION`, BUILD_VERSION y entrypoints se actualizan
a `2026.10.10.1` juntos; no se modificó VERSION público durante esta tarea.

QA: suite Node 1,157 pruebas (1,156 pass, 1 skip, 0 fail). Fixture browser con
assets reales, API sintética y Edge en320/375/390/430/768/1024/1280/1440:
consentimiento, reutilización, cambio de cliente, reselección422, inputs16px,
CTA y overflow. [Comparativas](../../tests/qa/operational-checkout-2026-10-10/README.md)
y arnés `scripts/qa-operational-checkout.cjs`. El arnés HTTP real entre repos se
documenta con su ejecución aparte; el fixture visual no lo suplanta.

Publicación futura: aprobar drafts y gates → backend con flags apagados →
backup/migraciones/validación de privacidad/capabilities → frontendFTPS →
verificar VERSION/assets/API → activar capacidades sólo con autorización.
Rollback: apagar guardado/avisos/emisión nuevos, revertir assets conservando
contrato compatible; no restaurar emisión de cookies basada en teléfono.
La nueva continuidad se limita al mismo credential: otro dispositivo o cliente
existente sin cookie segura compra como guest hasta verificación explícita futura.
Safari/iOS, Android y teclado real pendientes. Proveedores, pagos y clientes
reales no se usaron en pruebas.
