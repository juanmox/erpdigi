-- Quita la talla YARDAS. Falla (FK) si algo ya la usa: líneas de OP, consumos o
-- consumo estándar. En ese caso hay que decidir qué hacer con esos datos antes.
DELETE FROM recetas.tallas WHERE nombre = 'YARDAS';
