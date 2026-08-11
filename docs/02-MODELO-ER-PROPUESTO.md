# 02 — Modelo ER propuesto, ajustado a lo encontrado en Fase 0

> Este documento no repite todo `PROMPT_CLAUDE_CODE.md §5` — la mayoría del diseño ahí (rollos,
> reposiciones, OF/OP, outbox de sync) se valida **sin cambios** contra el esquema real. Aquí solo
> se listan los ajustes, con la razón de cada uno. Nada de esto está implementado todavía.

## Se mantiene tal cual (validado contra el esquema real)

- Todo `§5.3` (`orden_produccion`, `orden_facturacion`, `of_op`) — ninguna de estas tablas existe
  hoy, el diseño aplica directo.
- Todo `§5.4` (rollos, montaje, `fn_rollo_en()`) — es la pieza de mayor impacto del prompt y no
  depende de nada que ya exista; se construye desde cero como está diseñada.
- Todo `§5.5` (`linea_produccion`, `consumo_papel`, `reposicion`) — con el único punto de atención
  de la nota D4 más abajo sobre cómo se relaciona con `producto_insumos`.
- `§5.2` (`consumo_estandar`) tal cual, referenciando `<recetas.producto>` → confirmado que es
  `recetas.productos(id_producto)`.
- `costeo.linea_producto` (`§5.1`) — confirmado que es tabla **nueva**, `recetas.clientes` no trae
  esa dimensión (ver S1 en `00-VALIDACION-SUPUESTOS.md`).
- Todo `§7` (permisos) — encaja en el patrón ya existente de `core.permisos`, sin cambios de diseño.
- Todo `§8` (sync a Sheets, outbox) — no depende de nada del esquema actual.

## Ajuste D1 — `costeo.insumo` no se crea; se extiende `recetas.insumos`

**Cambio respecto al prompt `§5.6`:**

```diff
- CREATE TABLE costeo.insumo (
-     id                    serial PRIMARY KEY,
-     codigo                text UNIQUE,
-     nombre                text NOT NULL,
-     categoria_insumo_id   smallint NOT NULL REFERENCES costeo.categoria_insumo(id),
-     unidad_medida_id      smallint NOT NULL REFERENCES costeo.unidad_medida(id),
-     ...
- );
+ -- No se crea costeo.insumo. recetas.insumos ya cubre exactamente este rol
+ -- (id_insumo, codigo, descripcion, id_categoria, id_unidad, costo_promedio, activo),
+ -- incluso con categoría/unidad ya normalizadas. costeo lo referencia por FK,
+ -- mismo patrón que ya es requisito confirmado para productos (S5b).

CREATE TABLE costeo.insumo_costo (
    id              bigserial PRIMARY KEY,
-   insumo_id       integer NOT NULL REFERENCES costeo.insumo(id),
+   insumo_id       integer NOT NULL REFERENCES recetas.insumos(id_insumo),
    costo_unitario  numeric(14,6) NOT NULL CHECK (costo_unitario >= 0),
    vigente_desde   date NOT NULL,
    vigente_hasta   date,
    ...
);
```

`costeo.of_insumo` y `costeo.plantilla_insumo_detalle` ajustan su FK de `costeo.insumo(id)` a
`recetas.insumos(id_insumo)` en consecuencia. `costeo.categoria_insumo` y `costeo.unidad_medida`
(`§5.1`) tampoco se crean — se usan `recetas.categorias_insumo` y `recetas.unidades_medida`.

**Por qué:** `recetas.insumos` ya existe con 24 filas reales y el mismo rol que el prompt le pide a
`costeo.insumo`. Crear una tabla paralela obligaría a mantener dos maestros de insumos
sincronizados a mano — exactamente el tipo de duplicación que el principio `§4.3` del prompt
("nada de texto libre donde debe haber catálogo") busca evitar, solo que a nivel de tabla completa
en vez de campo. Los ~122 insumos de `ANEXO_B` que faltan se dan de alta en `recetas.insumos`
directamente (ya tiene pantalla en el ERP para eso), no en una tabla nueva.

**Pendiente de tu confirmación** antes de tocar el schema `recetas` con altas masivas de insumos.

## Ajuste D2 — recordatorio de seguridad heredado

No es un cambio de diseño de `costeo`, pero aplica a **cada endpoint nuevo** que se construya: el
`PermissionsGuard` del ERP es fail-open (ver `CLAUDE.md`). Todo controlador de `costeo` debe llevar
`@RequirePermissions(...)` explícito — no hay bloqueo por defecto si se olvida.

## Nota D3 — grano de `consumo_estandar` vs. `producto_insumos` (decisión, no ajuste automático)

`recetas.producto_insumos` (BOM completo, sin talla) y `costeo.consumo_estandar` (solo papel, con
talla) son conceptos distintos que **no se combinan solos**. El diseño de `§5.2` se mantiene igual
porque de todas formas es una tabla nueva y necesaria, pero la comparación "estándar vs. real" que
el prompt marca como el corazón del módulo (§6.3, fila "Comparación vs. estándar") solo puede
implementarse contra `costeo.consumo_estandar` (papel) de forma directa. Si querés que la
comparación también cubra el resto de insumos de la receta, es un diseño adicional a definir
contigo — no bloquea F1–F5.

## Bloqueante real D4 — cobertura de productos

Ver `docs/01-COBERTURA-PRODUCTOS.md`. Con 4 productos reales contra un catálogo legacy de 475,
cualquier tabla que dependa de `producto_id` (`consumo_estandar`, `linea_produccion`,
`consumo_papel`) va a tener cobertura mínima hasta que se resuelva la carga del catálogo completo
a `recetas`. No es un cambio al modelo de datos — el diseño del prompt ya lo previó correctamente
al no querer que `costeo` duplique el maestro de productos — pero sí es una dependencia de secuencia
que hay que decidir (ver las 3 opciones al final de `01-COBERTURA-PRODUCTOS.md`).

## Resumen para tu validación

| # | Punto | Tipo | Acción que pido |
|---|---|---|---|
| D1 | `costeo.insumo` → reusar `recetas.insumos` | Cambio de diseño | Confirmar o pedir que se mantenga separado |
| D2 | Fail-open en `PermissionsGuard` | Recordatorio | Ninguna acción ahora, solo disciplina al codificar |
| D3 | Grano `consumo_estandar` vs. `producto_insumos` | Decisión de alcance | Confirmar que la comparación aplica solo a papel por ahora |
| D4 | Cobertura de productos (4 de 475) | Bloqueante de secuencia | Elegir una de las 3 opciones en `01-COBERTURA-PRODUCTOS.md` |
| S4 | Ver también `00-VALIDACION-SUPUESTOS.md` | — | — |
| S6 | MOD/GF/FIJOS capturados, no calculados | Confirmar | Sí/no directo |
| S7 | Maestro de empleados / sistema biométrico | Confirmar | Existe, no existe, o dónde vive |

**Sigo esperando tu validación de estos puntos antes de generar cualquier migración o código de
aplicación**, tal como pide `§14.6` del prompt.
