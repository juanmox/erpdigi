-- Crea el rol de solo lectura que usa Superset para consultar el schema `analitica`.
--
-- Lo ejecuta un SUPERUSUARIO (en el servidor: `sudo -u postgres psql -d erpdb -f ...`),
-- porque el rol dueño de las migraciones (digitexsa_erp) no tiene CREATEROLE.
-- Local:  docker exec -i docker-postgres-1 psql -U digitexsa -d digitexsa_erp_dev < infra/bi/crear-rol-bi-lector.sql
--
-- La contraseña NO va en el repositorio: se pasa como variable.
--   psql -v clave="'la-contraseña'" -f crear-rol-bi-lector.sql
-- Es idempotente: re-ejecutarlo no falla y vuelve a aplicar los permisos.

\if :{?clave}
\else
  \echo 'Falta la variable clave: psql -v clave="''...''" -f crear-rol-bi-lector.sql'
  \quit
\endif

SELECT 'CREATE ROLE bi_lector LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_lector')
\gexec

ALTER ROLE bi_lector WITH PASSWORD :clave;

-- Una consulta de tablero que se cuelga no debe tumbar la base del ERP.
ALTER ROLE bi_lector SET statement_timeout = '30s';
ALTER ROLE bi_lector SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE bi_lector SET default_transaction_read_only = on;

-- Solo ve `analitica`. Nada de core (usuarios, tokens), recetas ni costeo.
DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO bi_lector', current_database());
END
$$;

GRANT USAGE ON SCHEMA analitica TO bi_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA analitica TO bi_lector;
-- Vistas que se agreguen después en `analitica` quedan accesibles sin repetir esto.
-- (ALTER DEFAULT PRIVILEGES aplica a objetos que cree el rol que lo ejecuta;
-- en el servidor, ejecutar también como digitexsa_erp si se agregan vistas.)
