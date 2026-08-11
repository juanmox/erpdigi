# 01 — Cobertura de productos: legacy vs. `recetas.productos`

> Cruce pedido en `PROMPT_CLAUDE_CODE.md §5.1` y `§14.4`. **Cobertura parcial** — el archivo fuente
> completo (475 códigos, hoja `TablaConsumos!Consumos`) no está en el repo. Lo que sigue es lo que
> se pudo verificar con lo disponible hoy, sin inventar el resto.

## Qué se cruzó realmente

`ANEXO_B_Catalogos.md §7` no trae los 475 códigos — trae 5 de ejemplo. `DataREPOSMig.xlsx`, el
único Excel colocado en el repo, es `DataREPOS!Registro` (reposiciones) y `DataREPOS!Empleados`,
ninguna de las dos con columna de código de producto. Por eso el cruce real solo pudo hacerse con
los 5 ejemplos de `ANEXO_B` — no con los 475.

| Código (ejemplo, `ANEXO_B §7`) | Descripción | ¿Existe en `recetas.productos`? |
|---|---|---|
| `BSNS-VB-0006Y` | VOLLEYBALL_YOUTH_V NECK JERSEY SS | ❌ No |
| `BSNS-VB-0003W` | VOLLEYBALL_WOMEN_VNECK JERSEY SLEEVELESS | ❌ No |
| `BSN-SGS7MBS` | SOCCER_MEN_SHORT 7" INSEAM | ❌ No |
| `BSN-SO1` | SOCCER_MEN JERSEY | ❌ No |
| `BSNWCP09` | (compression) | ❌ No |

**5 de 5 no encontrados.**

## Lo que sí existe hoy en `recetas.productos` (4 filas, producción real)

| Código | Descripción |
|---|---|
| `BSN-FB01N` | KNIT 90/10 POLY SPANDEX MEN FOOTBALL JERSEY |
| `BSN-FB02NB` | 85/15% POLY SPANDEX MEN FOOTBALL PANT W/BELT |
| `BSN-YFB02NB` | 85/15% POLY SPANDEX YOUTH FOOTBALL PANT W/BELT |
| `BSN-FB01ESPN` | 92/8 POLY SPANDEX ELITE FOOTBALL JERSEY (SHOULDER PAD NUMBER) |

Estos 4 son del piloto de migración de Fase 2 (Hoja Técnica) — todos son de fútbol americano
(`FB`), mientras que los 5 ejemplos de `ANEXO_B` son de vóleibol y soccer (`VB`, `SO`, `SGS`, `WCP`).
No hay superposición ni siquiera en la convención de prefijo.

## Insumos — cruce que sí se pudo completar (referencia, no pedido explícitamente pero relevante)

A diferencia de productos, sí tenía el catálogo completo de insumos (`ANEXO_B §10`, 133 códigos
identificables) para cruzar contra `recetas.insumos` real:

**11 de 133 encontrados (8%).** Ver `docs/00-VALIDACION-SUPUESTOS.md §S4` para el detalle y la
recomendación de diseño que se desprende de esto.

## Conclusión de esta fase

Con **0% de cobertura verificada** en la muestra de productos disponible, y sabiendo que solo 4
productos reales existen contra 475 esperados, es razonable asumir (sin poder confirmarlo al 100%
sin el archivo completo) que **la gran mayoría de los 475 códigos del legacy no están today en
`recetas`**. Esto no es un error de nadie — Fase 2 migró un piloto, no el catálogo completo — pero
es un bloqueante real para cualquier tabla de `costeo` que dependa de `producto_id`
(`consumo_estandar`, `linea_produccion`, `consumo_papel`).

## Qué necesito para completar esto

1. El archivo con los 475 códigos completos (`TablaConsumos!Consumos` o el Excel que lo contenga).
2. Con eso, genero el cruce completo código por código y una lista real de faltantes.
3. **No voy a dar de alta productos automáticamente** — eso ya lo pide el prompt explícitamente
   (`§14.4`, `§13` "Qué no hacer") y coincide con la política ya establecida en este ERP
   (`CLAUDE.md`: "no inventar requisitos").

## Decisión pendiente, independiente del cruce completo

Aunque se complete el cruce, el número de productos faltantes va a ser grande (probablemente >90%
según la muestra). Antes de F2 (Gestión de Rollos) tiene sentido decidir contigo si:

- (a) se importa el catálogo completo de productos a `recetas` **antes** de empezar `costeo`
  (bloqueante real para las tablas con `producto_id`), o
- (b) se construye `costeo` en paralelo y se acepta que `consumo_estandar`/`linea_produccion` van a
  tener huecos de cobertura hasta que el catálogo de productos se complete por otra vía, o
- (c) se prioriza F0(catálogos)/F2(rollos)/F3(reposiciones) — que no dependen de `producto_id` — y
  se deja F4(consumo de papel)/F5(insumos por OF) para después de resolver la cobertura de
  productos.

No es una decisión que me corresponda tomar sola — la dejo marcada para tu validación, como pide
el prompt en su primera instrucción.
