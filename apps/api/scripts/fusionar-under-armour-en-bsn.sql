-- Fusiona el "cliente" UNDER ARMOUR (411) en BSN SPORTS (181).
--
-- UNDER ARMOUR no es un cliente: es un subcliente de BSN, y a BSN es a quien se
-- factura. No figura en el catálogo autoritativo de 99 clientes (el libro
-- "Recetas" del Sheets legacy), donde los 33 productos UA-* están todos
-- asignados a BSN SPORTS. Lo creé por SQL el 2026-09-30 tomando como única
-- evidencia el archivo OrigenConsumo, cuyo campo CLIENTE mezcla cliente,
-- deporte, prenda y marca en un texto libre.
--
-- ⚠️ El ORDEN importa. `costeo.orden_produccion.id_cliente` es ON DELETE SET
-- NULL: borrar el cliente sin repuntar primero dejaría 725 OP SIN CLIENTE, en
-- silencio. Por eso el DELETE va después de los UPDATE y detrás de una guarda
-- que exige cero referencias.
--
-- La marca no se pierde al fusionar: la orden nunca tuvo el dato confiable
-- (642 OP eran puras UA, pero 32 mezclaban UA con otras prendas y 54 OP de BSN
-- ya llevaban productos UA-*). El marcador real es el código del producto.
--
-- Uso:  psql ... -v ON_ERROR_STOP=1 -f fusionar-under-armour-en-bsn.sql
-- Antes: pg_dump --schema=recetas --schema=costeo

BEGIN;

DO $$
DECLARE v_ua int; v_bsn int;
BEGIN
  -- Por nombre y código, nunca por id: los ids difieren entre ambientes.
  SELECT id_cliente INTO v_ua  FROM recetas.clientes WHERE codigo='411' AND nombre='UNDER ARMOUR';
  SELECT id_cliente INTO v_bsn FROM recetas.clientes WHERE codigo='181' AND nombre='BSN SPORTS';
  IF v_ua IS NULL THEN RAISE EXCEPTION 'No existe el cliente 411 UNDER ARMOUR: nada que fusionar'; END IF;
  IF v_bsn IS NULL THEN RAISE EXCEPTION 'No existe el cliente 181 BSN SPORTS: destino inválido'; END IF;
  IF v_ua = v_bsn THEN RAISE EXCEPTION 'Origen y destino son el mismo cliente'; END IF;
END $$;

CREATE TEMP TABLE ids AS
SELECT (SELECT id_cliente FROM recetas.clientes WHERE codigo='411' AND nombre='UNDER ARMOUR') AS ua,
       (SELECT id_cliente FROM recetas.clientes WHERE codigo='181' AND nombre='BSN SPORTS')   AS bsn,
       -- Se compara contra el valor PREVIO y no contra cero: puede haber OP sin
       -- cliente de antes (en local había 7, de la migración del legacy).
       (SELECT count(*) FROM costeo.orden_produccion WHERE id_cliente IS NULL) AS sin_cliente_antes;

-- Se GUARDA qué se va a tocar antes de tocarlo. Sin esta lista, deshacer la
-- fusión exigiría restaurar el respaldo completo de la base; con ella alcanza
-- con `revertir-fusion-under-armour.sql`, que la lee de la bitácora.
CREATE TEMP TABLE afectados AS
SELECT 'orden_produccion' AS tabla, o.codigo AS clave
  FROM costeo.orden_produccion o WHERE o.id_cliente = (SELECT ua FROM ids)
UNION ALL
SELECT 'producto', p.codigo FROM recetas.productos p WHERE p.id_cliente = (SELECT ua FROM ids)
UNION ALL
SELECT 'desarrollo', d.codigo FROM recetas.desarrollos d WHERE d.id_cliente = (SELECT ua FROM ids)
UNION ALL
SELECT 'orden_facturacion', f.codigo FROM costeo.orden_facturacion f WHERE f.id_cliente = (SELECT ua FROM ids);

UPDATE recetas.productos        SET id_cliente=(SELECT bsn FROM ids) WHERE id_cliente=(SELECT ua FROM ids);
UPDATE recetas.desarrollos      SET id_cliente=(SELECT bsn FROM ids) WHERE id_cliente=(SELECT ua FROM ids);
UPDATE costeo.orden_produccion  SET id_cliente=(SELECT bsn FROM ids) WHERE id_cliente=(SELECT ua FROM ids);
UPDATE costeo.orden_facturacion SET id_cliente=(SELECT bsn FROM ids) WHERE id_cliente=(SELECT ua FROM ids);

DO $$
DECLARE v_ua int; n int;
BEGIN
  SELECT ua INTO v_ua FROM ids;
  SELECT (SELECT count(*) FROM recetas.productos        WHERE id_cliente=v_ua)
       + (SELECT count(*) FROM recetas.desarrollos      WHERE id_cliente=v_ua)
       + (SELECT count(*) FROM costeo.orden_produccion  WHERE id_cliente=v_ua)
       + (SELECT count(*) FROM costeo.orden_facturacion WHERE id_cliente=v_ua) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'Quedan % referencias a UNDER ARMOUR; no se borra', n; END IF;
END $$;

DELETE FROM recetas.clientes WHERE id_cliente=(SELECT ua FROM ids);

-- El cambio no pasa por la API, así que el rastro se escribe a mano.
INSERT INTO core.auditoria (id_empresa, id_usuario, usuario_nombre, entidad, id_entidad, accion, datos_anteriores, datos_nuevos)
SELECT (SELECT id_empresa FROM core.empresas WHERE codigo='DIGITEXSA'), NULL, 'migración SQL',
       'recetas.clientes', '411', 'DELETE',
       -- `datos_anteriores` lleva la lista completa de lo repuntado, por
       -- código y nunca por id: es lo que hace reversible la fusión.
       jsonb_build_object(
         'codigo','411','nombre','UNDER ARMOUR',
         'repuntados', (SELECT coalesce(jsonb_object_agg(tabla, claves), '{}'::jsonb)
                        FROM (SELECT tabla, jsonb_agg(clave ORDER BY clave) AS claves
                              FROM afectados GROUP BY tabla) t)),
       jsonb_build_object('motivo','No es un cliente sino un subcliente de BSN SPORTS; no figura en el catálogo autoritativo de 99 clientes',
                          'destino','BSN SPORTS (181)',
                          'revertir_con','apps/api/scripts/revertir-fusion-under-armour.sql');

DO $$
DECLARE antes int; ahora int;
BEGIN
  SELECT sin_cliente_antes INTO antes FROM ids;
  SELECT count(*) INTO ahora FROM costeo.orden_produccion WHERE id_cliente IS NULL;
  IF ahora <> antes THEN RAISE EXCEPTION 'OP sin cliente pasó de % a %: el SET NULL vació órdenes', antes, ahora; END IF;
END $$;

-- Qué se hizo, para que quede a la vista en la consola del despliegue.
SELECT tabla, count(*) AS repuntados FROM afectados GROUP BY tabla ORDER BY 1;

COMMIT;
