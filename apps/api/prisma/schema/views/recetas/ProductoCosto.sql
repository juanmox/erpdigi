SELECT
  p.id_producto,
  p.codigo,
  p.descripcion,
  COALESCE(vd.costo_insumos, (0)::numeric) AS costo_insumos,
  COALESCE(vd.costo_mano_obra, (0)::numeric) AS costo_mano_obra,
  COALESCE(vd.costo_unitario, (0)::numeric) AS costo_unitario
FROM ((recetas.productos p
   LEFT JOIN recetas.desarrollos d ON (((d.codigo)::text = (p.desarrollo)::text)))
   LEFT JOIN recetas.v_desarrollo_costo vd ON ((vd.id_desarrollo = d.id_desarrollo)));
