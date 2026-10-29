-- Talla "YARDAS" para los servicios de sublimación continua.
--
-- En esas órdenes no hay prendas: la cantidad son las yardas a sublimar. El
-- legacy lo trataba como una "talla" más (columna YARDAS, y YDS desde 2025), con
-- 2,490 filas reales entre julio 2024 y septiembre 2026. Sin esta fila el import
-- de Órdenes rechazaba la columna como "no es una talla que el import reconozca".
--
-- Va en la migración y no solo en el seed porque el seed no corre solo al
-- desplegar y el import resuelve la talla por nombre contra este catálogo.
-- Idempotente: si ya existe (sembrada a mano), no la toca.
--
-- El consumo estándar de cada producto de servicio (1 yd de papel por yd, o sea
-- 36 pulgadas) NO se carga acá: lleva `creado_por` y es un dato de negocio por
-- producto, se carga por la pantalla de Consumo Estándar.

INSERT INTO recetas.tallas (nombre, orden, grupo, frecuente)
VALUES ('YARDAS', 1200, 'SERVICIO', false)
ON CONFLICT (nombre) DO NOTHING;
