# AGENTS.md — rdecants.com (tienda RDECANTS)

Entrada para cualquier agente que trabaje en la tienda. Revisado el 2026-11-05.
Nota: el despliegue copia la raíz de este repositorio al sitio público; este
archivo no debe contener rutas internas, credenciales ni datos privados.

## Continuidad entre sesiones

Al continuar una misión, primero comprueba rama, commit y cambios sin guardar;
lee el estado vigente, foco, autoridades, changelog reciente y decisiones ya
aprobadas. Retoma la última evidencia real registrada: no repitas investigación,
recuperación de commits ni generación de recursos que ya estén completos salvo
que una verificación nueva indique un problema. Mantén este orden al actualizar
la documentación de continuidad para futuras sesiones.

## 1. Qué es este repositorio

- La tienda pública `https://rdecants.com`: HTML estático + módulos ES nativos,
  sin build ni framework. Rama viva: **`production`** (no `main`).
- Los datos (productos, precios, existencias, imágenes, perfiles olfativos,
  packs, entrega, descuentos, pedidos) vienen de R Supply OS por
  `https://api.rdecants.com/api/web/*`. La tienda presenta; no decide datos.
- La guía completa (contrato con el backend, packs, quién controla qué,
  identidad visual y preparación del rediseño) vive en el repositorio del
  backend: `r-supply-os/RSNEXUS/architecture/RDECANTS-STOREFRONT.md`.
  En esta máquina, la carpeta hermana `../r-supply-os` (o su worktree vigente).

## 2. Antes de tocar nada

```bash
git fetch origin && git log -1 --oneline origin/production && cat VERSION
```

Trabaja sobre `origin/production`. Los worktrees nuevos suelen nacer de `main`,
que va atrás. La copia `rdecants-web/` dentro de `r-supply-os` (VERSION `2.0.0`)
**no** es esta tienda.

Lee, según la tarea: `README_DEPLOY.md` (despliegue y QA),
`docs/rdecants-product-redesign-spec.md` (posicionamiento, sistema de diseño,
fases), `docs/CUSTOMER-EXPERIENCE.md` (contrato de perfil olfativo,
presentaciones y checkout) y la guía del backend citada arriba.

## 3. Reglas

- La identidad visual vigente es `assets/css/tokens.css`. No se cambia la
  paleta, la tipografía ni la voz sin decisión de Roger. El sistema del panel de
  R Supply OS (`CANVAS.md`, `IDENTIDAD-VISUAL.md`) **no** se aplica aquí.
- No inventes datos: sin precios, existencias, notas, reseñas, contadores ni
  urgencia que no vengan del backend. Si falta un dato, se oculta la sección.
- No cambies el contrato `/api/web/*` desde aquí. Un dato nuevo se pide al
  backend en su propio PR, que se despliega primero.
- Nunca registres pedidos de prueba contra producción. QA con
  `node scripts/preview.mjs` o contra un backend local (ver `README_DEPLOY.md`).
- `VERSION`, `BUILD_VERSION` en `assets/js/api/config.js` y los `?v=` de cada
  HTML deben coincidir (`tests/cacheFreshness.test.js`).
- Pruebas: `node --test` (rápido). Corre la suite antes de cada commit que cambie código.
- Backend para pruebas integradas: la única QA del proyecto, «QA Local Principal»
  (`http://127.0.0.1:8150`, datos ficticios), descrita en el backend en
  `RSNEXUS/testing/QA-LOCAL-PRINCIPAL.md`. No levantes otra API de prueba. Para
  usarla desde el navegador hace falta antes un ajuste de CORS en el backend (ver
  ese documento); mientras tanto usa `node scripts/preview.mjs`.
- Desplegar = merge a `production` (GitHub Actions publica por FTPS). Sólo con
  autorización de Roger. Una captura local no es la verificación del navegador
  real del dueño: dilo así.

## 4. Al terminar

Actualiza sólo lo afectado: `docs/rdecants-product-redesign-spec.md` si cambia
el diseño aprobado; `README_DEPLOY.md` si cambia el despliegue; y en el backend,
`RSNEXUS/architecture/RDECANTS-STOREFRONT.md` y `RSNEXUS/CURRENT_STATE.md` §0
si cambia el contrato, la versión en vivo o el estado del rediseño.
No marques como desplegado algo que sólo está en un commit local.
