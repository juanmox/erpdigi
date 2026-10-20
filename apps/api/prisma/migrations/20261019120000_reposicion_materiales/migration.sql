-- Fase A de las reposiciones de materiales: el tipo, la tabla hija y las
-- reglas de coherencia. Sin tocar ninguna pantalla todavía.
--
-- Contexto medido antes de escribir esto: el formulario dejaba crear
-- reposiciones incoherentes porque la impresora, el papel y la tela son
-- opcionales en las tres capas. No se desactivó nada — el DTO nació así —
-- pero el legacy SÍ lo exigía: de las 3,612 reposiciones migradas, 0 sin
-- impresora y 0 sin tela, contra 18 y 7 entre las creadas en el ERP.

-- ── 1. El tipo ──────────────────────────────────────────────────────
-- Columna y no "se deduce de qué campos vinieron", por tres razones: la base
-- puede imponer la exclusividad, el espejo a Sheets decide con una
-- comparación, y se puede preguntar cuántas requisiciones de material hubo.
-- Mismo patrón que `consumo_papel.origen`.
ALTER TABLE costeo.reposicion
  ADD COLUMN tipo varchar(20) NOT NULL DEFAULT 'REIMPRESION';

ALTER TABLE costeo.reposicion
  ADD CONSTRAINT ck_reposicion_tipo CHECK (tipo IN ('REIMPRESION', 'MATERIALES'));

COMMENT ON COLUMN costeo.reposicion.tipo IS
  'REIMPRESION (papel + tela) o MATERIALES (N insumos en reposicion_insumo). Son excluyentes por decisión del usuario (2026-10-19).';

-- ── 2. Las líneas de material ───────────────────────────────────────
-- Tabla hija y no un par de columnas `id_insumo_material`/`cantidad_material`:
-- una requisición lleva N materiales. La evidencia es real — 229 de 309 grupos
-- de reposiciones con la misma OP, fecha, departamento y defecto tienen
-- insumos DISTINTOS, o sea que ya se parte una requisición en varias filas
-- porque solo cabe un insumo (R01/R02 a 6 minutos, R03/R04 a 2 minutos).
--
-- Se llama `reposicion_insumo` y no `_material` a propósito: si algún día la
-- tela se muda acá, el nombre ya sirve. Hoy solo la usan las de tipo
-- MATERIALES.
CREATE TABLE costeo.reposicion_insumo (
  id_reposicion_insumo serial         PRIMARY KEY,
  id_reposicion        integer        NOT NULL,
  id_insumo            integer        NOT NULL,
  -- `cantidad` y NUNCA `yardas`: de los 443 materiales, 248 se miden en
  -- UNIDAD (bolsas, etiquetas, zippers, herrajes) y 195 en YARDAS. La unidad
  -- se lee del insumo, no se guarda acá.
  cantidad             numeric(14,4)  NOT NULL,
  creado_en            timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT reposicion_insumo_id_reposicion_fkey FOREIGN KEY (id_reposicion)
    REFERENCES costeo.reposicion(id_reposicion) ON UPDATE CASCADE ON DELETE CASCADE,
  -- RESTRICT y no SET NULL: un insumo que ya se requisó no se puede borrar.
  -- Es justo lo contrario de `reposicion.id_insumo_tela`, que es SET NULL y
  -- habría vaciado la tela en silencio al borrar un insumo (se vio al retirar
  -- el TEST-001 el 2026-10-19).
  CONSTRAINT reposicion_insumo_id_insumo_fkey FOREIGN KEY (id_insumo)
    REFERENCES recetas.insumos(id_insumo) ON UPDATE CASCADE ON DELETE RESTRICT,
  -- El mismo material no se lista dos veces en la misma requisición: se suma.
  CONSTRAINT reposicion_insumo_unico UNIQUE (id_reposicion, id_insumo),
  CONSTRAINT ck_reposicion_insumo_cantidad CHECK (cantidad > 0)
);

-- Para la consulta "qué salió de bodega de este insumo", que es la que va a
-- necesitar el módulo de Inventario.
CREATE INDEX idx_reposicion_insumo_insumo ON costeo.reposicion_insumo(id_insumo);

-- ── 3. La regla de coherencia ───────────────────────────────────────
-- ⚠️ NOT VALID a propósito. Hay ~190 filas vigentes que ya la violan (160 con
-- tela y 0 yardas —135 de ellas migradas del legacy, que también lo toleraba—,
-- 18 sin impresora, 8 sin yardas de papel, 7 sin insumo de tela y 1 vacía).
-- Un CHECK normal fallaría al crearse. NOT VALID impone la regla a todo lo
-- nuevo y deja lo viejo marcado, no escondido: cuando esas filas se decidan,
-- un `VALIDATE CONSTRAINT` cierra el círculo.
--
-- Qué NO exige, y por qué:
--   · `id_montaje_rollo` — las 3,612 migradas tienen tipo de papel y ningún
--     montaje. Exigirlo bloquearía cualquier carga retroactiva futura.
--   · `id_calandra` — se usa en 351 de 4,717 filas; es opcional de verdad.
ALTER TABLE costeo.reposicion
  ADD CONSTRAINT ck_reposicion_tipo_regla CHECK (
    CASE tipo
      WHEN 'MATERIALES' THEN
        id_impresora IS NULL
        AND id_tipo_papel IS NULL
        AND id_montaje_rollo IS NULL
        AND id_insumo_tela IS NULL
        AND yardas_papel = 0
        AND yardas_tela = 0
      WHEN 'REIMPRESION' THEN
        -- impresora y tipo de papel son equivalentes en los datos reales:
        -- 0 filas tienen una sin la otra.
        id_impresora IS NOT NULL
        AND id_tipo_papel IS NOT NULL
        AND yardas_papel > 0
        AND id_insumo_tela IS NOT NULL
        AND yardas_tela > 0
      ELSE false
    END
  ) NOT VALID;

-- La regla que la base NO puede imponer (es entre tablas) y queda en el
-- servicio: una reposición MATERIALES necesita al menos una línea.
COMMENT ON TABLE costeo.reposicion_insumo IS
  'Materiales de una reposición tipo MATERIALES. Que tenga al menos una línea lo impone el servicio: un CHECK no puede mirar otra tabla.';
