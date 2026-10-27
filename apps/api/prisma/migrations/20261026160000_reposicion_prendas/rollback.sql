-- Revierte 20261026160000_reposicion_prendas. Borra las prendas registradas: las
-- reposiciones en sí no se tocan.
-- Si ya se aplicó 20261026170000_analitica_reposicion_prendas, revertir ESA primero
-- (la vista depende de esta tabla).
DROP TABLE IF EXISTS costeo.reposicion_prenda;
