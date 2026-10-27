-- Deshace crear-rol-bi-lector.sql. Ejecutar como superusuario DESPUÉS de
-- rollback.sql de 20261025120000_analitica_vistas (o junto con él).
DROP OWNED BY bi_lector;
DROP ROLE IF EXISTS bi_lector;
