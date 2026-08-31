-- ============================================================================
-- ROLLBACK de 20260826120000_desarrollos_duenos_de_receta.
--
-- ⚠️ Este archivo NO lo ejecuta Prisma (migrate deploy solo corre
-- migration.sql). Está acá para tenerlo a mano si hay que revertir.
--
-- Es posible revertir porque la migración fue aditiva y porque
-- recetas.producto_insumos quedó CONGELADA, no vaciada: el BOM viejo sigue
-- intacto ahí.
--
-- ⚠️ LO QUE SÍ SE PIERDE: cualquier receta creada o editada en
-- desarrollo_insumos DESPUÉS de la migración. Esos cambios nunca llegaron a
-- producto_insumos. Por eso conviene no dejar pasar días entre el despliegue y
-- la validación — mientras más tiempo pase, más caro es el rollback.
-- ============================================================================

-- 1. Restaurar la definición original de la vista (la que lee producto_insumos
--    y la mano de obra del producto).
CREATE OR REPLACE VIEW "recetas"."v_producto_costo" AS
SELECT p.id_producto,
       p.codigo,
       p.descripcion,
       COALESCE(sum((pi.consumo * i.costo_promedio)), (0)::numeric) AS costo_insumos,
       (p.minutos_mo * p.costo_mo_minuto) AS costo_mano_obra,
       (COALESCE(sum((pi.consumo * i.costo_promedio)), (0)::numeric)
        + (p.minutos_mo * p.costo_mo_minuto)) AS costo_unitario
FROM ((recetas.productos p
   LEFT JOIN recetas.producto_insumos pi ON ((pi.id_producto = p.id_producto)))
   LEFT JOIN recetas.insumos i ON ((i.id_insumo = pi.id_insumo)))
GROUP BY p.id_producto;

-- 2. Borrar lo creado.
DROP VIEW IF EXISTS "recetas"."v_desarrollo_costo";
DROP TABLE IF EXISTS "recetas"."desarrollo_insumos";
DROP TABLE IF EXISTS "recetas"."desarrollos";

-- 3. Dejar el historial de Prisma consistente.
--    DELETE FROM public._prisma_migrations
--     WHERE migration_name = '20260826120000_desarrollos_duenos_de_receta';
