-- Revierte 20261025120000_analitica_vistas: solo quita objetos que esa migración
-- creó. No toca ninguna tabla de core, recetas ni costeo.
-- El rol bi_lector, si existe, se elimina aparte (infra/bi/quitar-rol-bi-lector.sql).
DROP SCHEMA IF EXISTS analitica CASCADE;
