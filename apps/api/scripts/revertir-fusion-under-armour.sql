-- Deshace `fusionar-under-armour-en-bsn.sql` sin restaurar el respaldo.
--
-- Lee de `core.auditoria` la lista de lo que la fusión repuntó —guardada ahí
-- por código, nunca por id— recrea el cliente 411 y devuelve cada registro.
--
-- ⚠️ Solo sirve ANTES de aplicar la migración de subclientes: esa migración
-- crea el subcliente con código 411, y el UNIQUE no deja que coexista con un
-- cliente del mismo código. Si ya se aplicó, primero hay que revertirla con su
-- `rollback.sql`.
--
-- ⚠️ NO deshace lo que haya pasado después: una orden nueva cargada a BSN
-- SPORTS entre la fusión y la reversión se queda en BSN, que es lo correcto.
--
-- Uso:  psql ... -v ON_ERROR_STOP=1 -f revertir-fusion-under-armour.sql

BEGIN;

DO $$
DECLARE v_log jsonb; v_bsn int; v_ua int; n int;
BEGIN
  -- El registro más reciente de la fusión.
  SELECT datos_anteriores INTO v_log
  FROM core.auditoria
  WHERE entidad = 'recetas.clientes' AND id_entidad = '411' AND accion = 'DELETE'
    AND datos_anteriores ? 'repuntados'
  ORDER BY id_auditoria DESC LIMIT 1;

  IF v_log IS NULL THEN
    RAISE EXCEPTION 'No hay registro de la fusión en core.auditoria: no se puede revertir con este script (usá el respaldo)';
  END IF;
  IF EXISTS (SELECT 1 FROM recetas.clientes WHERE codigo = '411') THEN
    RAISE EXCEPTION 'El cliente 411 ya existe: la fusión no está aplicada';
  END IF;
  -- ⚠️ Por `information_schema` y no nombrando la tabla: este script corre
  -- justo cuando `recetas.subclientes` NO existe todavía, y referenciarla
  -- hace fallar el bloque aunque la rama no se cumpla.
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='recetas' AND table_name='subclientes') THEN
    EXECUTE 'SELECT count(*) FROM recetas.subclientes WHERE codigo = ''411''' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Existe el subcliente 411: revertí antes la migración de subclientes con su rollback.sql';
    END IF;
  END IF;

  SELECT id_cliente INTO v_bsn FROM recetas.clientes WHERE codigo='181' AND nombre='BSN SPORTS';
  IF v_bsn IS NULL THEN RAISE EXCEPTION 'No existe BSN SPORTS: estado inesperado'; END IF;

  INSERT INTO recetas.clientes (codigo, nombre)
  VALUES ('411', v_log->>'nombre') RETURNING id_cliente INTO v_ua;

  UPDATE costeo.orden_produccion SET id_cliente = v_ua
  WHERE id_cliente = v_bsn
    AND codigo IN (SELECT jsonb_array_elements_text(v_log->'repuntados'->'orden_produccion'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'órdenes devueltas: %', n;

  UPDATE recetas.productos SET id_cliente = v_ua
  WHERE id_cliente = v_bsn
    AND codigo IN (SELECT jsonb_array_elements_text(coalesce(v_log->'repuntados'->'producto', '[]'::jsonb)));
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'productos devueltos: %', n;

  UPDATE recetas.desarrollos SET id_cliente = v_ua
  WHERE id_cliente = v_bsn
    AND codigo IN (SELECT jsonb_array_elements_text(coalesce(v_log->'repuntados'->'desarrollo', '[]'::jsonb)));

  UPDATE costeo.orden_facturacion SET id_cliente = v_ua
  WHERE id_cliente = v_bsn
    AND codigo IN (SELECT jsonb_array_elements_text(coalesce(v_log->'repuntados'->'orden_facturacion', '[]'::jsonb)));

  INSERT INTO core.auditoria (id_empresa, id_usuario, usuario_nombre, entidad, id_entidad, accion, datos_nuevos)
  SELECT (SELECT id_empresa FROM core.empresas WHERE codigo='DIGITEXSA'), NULL, 'migración SQL',
         'recetas.clientes', '411', 'INSERT',
         jsonb_build_object('motivo','Reversión de la fusión de UNDER ARMOUR en BSN SPORTS');
END $$;

COMMIT;
