# Ventana confirmada — candidata #220

> La semántica de salida sustituye la etiqueta anterior de entrega en el parche
> `2026-10-12-dispatch-departure-labels.md`. #22 debe integrarse junto con ese
> parche y backend #236; no publicarlo solo con la etiqueta anterior.

Base remota `production` comprobada: `5e89246a82fab1fe19076af75fc6c8f3bb0920cc`.
La cuenta muestra `delivery.confirmed_window` sólo cuando el backend devuelve
`kind=confirmed` y una etiqueta. Conserva el horario originalmente preferido;
una preferencia no se convierte en compromiso. Escapa la etiqueta recibida.

No calcula fechas, tarifas, capacidad ni pagos. Sigue usando la sesión HttpOnly
y los endpoints existentes. Compatible con backend anterior: sin el campo nuevo,
se conserva la presentación previa. La política de salidas y el compromiso
pertenecen a R Supply OS; su nueva flag permanece apagada en producción.

Validación: 1,158 pruebas frontend, 1,157 pasan y una omisión heredada. Las dos
presentaciones muestran confirmación sólo con evidencia del backend; un objeto
`kind=requested` no muestra «Entrega confirmada». Cache key nuevo únicamente
para el módulo de cuenta cambiado. Sin publicación ni activación del candidato.
