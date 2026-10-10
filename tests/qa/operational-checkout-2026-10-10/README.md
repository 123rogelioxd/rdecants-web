# Checkout operativo · 2026-10-10

Base reproducida: `4067f61` (`origin/production`). Capturas con Edge 154 headless, Playwright y fixture sintético local. Ninguna API real, pedido real, cobro ni mensaje externo.

`before-375.png`: la dirección de la API se insertaba automáticamente. `after-375.png`: se ofrece la dirección guardada para una acción explícita. `reselect-422-375.png`: rechazo del horario conserva pedido y requiere nueva elección. `review-1440.png`: revisión de productos, dirección e importe canónico de la cotización.

`results.json` registra 320, 375, 390, 430, 768, 1024, 1280 y 1440 px. Se verificó: sin overflow horizontal; campos de al menos 16 px; CTA dentro del viewport; radios de consentimiento sin selección inicial; dirección vacía antes de aceptar reutilizar; cambio de teléfono borra prefill; dirección y notas privadas fuera de localStorage; 422 conserva carrito, dirección, preferencia original y token firmado hasta reseleccionar.

Reproducción: instalar Playwright o establecer `PLAYWRIGHT_MODULE` a su instalación, ejecutar `node scripts/qa-operational-checkout.cjs`. `QA_BROWSER` selecciona el canal (predeterminado `msedge`), `QA_OUTPUT` el directorio de evidencia. `QA_BASELINE_ROOT` apunta a una extracción de la base para capturar el antes.

Suite completa Node: 1157 pruebas, 1156 correctas, 0 fallas, 1 omitida (API real opcional). Siete nuevas regresiones fallaron antes de implementar y pasan después; otras tres cubren capability, fallo de borrado y POST 422 real conservando también cupones. Prueba de compatibilidad: APIs antiguas sin `address_saved:true` nunca ofrecen prefill; sin `capabilities.saved_addresses:true` no ofrecen guardar; sin `whatsapp_url` seguro no inventan el mensaje ni abren un destino alternativo.

Limitación: headless verifica tamaños, foco, scroll y estructura; el zoom automático y teclado físico de Safari iOS deben validarse en dispositivo antes de activar en producción. Esta rama no se desplegó.
