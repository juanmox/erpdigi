-- Verificación PREVIA al despliegue de subclientes. Solo SELECT: no escribe
-- nada, no abre transacción, se puede correr contra producción en caliente.
--
-- Uso:  psql ... -f preflight-subclientes.sql

\pset format aligned
\echo '=== 1. ¿Está el cliente 411 y cuánto arrastra? ==='
SELECT c.codigo, c.nombre,
       (SELECT count(*) FROM recetas.productos p WHERE p.id_cliente=c.id_cliente)        AS productos,
       (SELECT count(*) FROM recetas.desarrollos d WHERE d.id_cliente=c.id_cliente)      AS desarrollos,
       (SELECT count(*) FROM costeo.orden_produccion o WHERE o.id_cliente=c.id_cliente)  AS ordenes,
       (SELECT count(*) FROM costeo.orden_facturacion f WHERE f.id_cliente=c.id_cliente) AS facturacion
FROM recetas.clientes c WHERE c.codigo='411';

\echo ''
\echo '=== 2. BSN SPORTS tiene que existir (es el destino) ==='
SELECT id_cliente, codigo, nombre FROM recetas.clientes WHERE codigo='181';

\echo ''
\echo '=== 3. Productos que la migración va a marcar como Under Armour ==='
SELECT count(*) AS productos_ua_por_prefijo FROM recetas.productos WHERE codigo ~* '^(UA|YUA)[-_]';

\echo ''
\echo '=== 4. OP sin cliente HOY (la guarda compara contra este número) ==='
SELECT count(*) AS op_sin_cliente FROM costeo.orden_produccion WHERE id_cliente IS NULL;

\echo ''
\echo '=== 5. ¿Chocaría algo? (todo debe dar 0) ==='
-- ⚠️ Todo se consulta contra `information_schema`, sin nombrar
-- `recetas.subclientes`: en el estado normal —antes de desplegar— esa tabla NO
-- existe, y Postgres parsea la consulta ENTERA antes de ejecutarla, así que
-- mencionarla hace fallar el preflight justo en el caso para el que sirve.
-- (Ni `to_regclass` ni un CASE muerto alcanzan: el error es de parseo.)
SELECT 'tabla recetas.subclientes ya existe' AS riesgo,
       (SELECT count(*)::int FROM information_schema.tables
        WHERE table_schema='recetas' AND table_name='subclientes') AS n
UNION ALL
SELECT 'columna recetas.clientes.activo ya existe',
       (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema='recetas' AND table_name='clientes' AND column_name='activo')
UNION ALL
SELECT 'columna recetas.productos.id_subcliente ya existe',
       (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema='recetas' AND table_name='productos' AND column_name='id_subcliente');

\echo ''
\echo '=== 6. Lo que los usuarios van a ver distinto ==='
SELECT count(*) AS ordenes_que_cambian_de_cliente
FROM costeo.orden_produccion o JOIN recetas.clientes c USING (id_cliente) WHERE c.codigo='411';
