-- Revierte la explosión de materiales. ⚠️ Borra lo cargado: hay que respaldar antes si ya se usó.
DROP VIEW IF EXISTS analitica.v_materiales_op;
DROP TABLE IF EXISTS costeo.material_op;
DROP TABLE IF EXISTS costeo.carga_material;
