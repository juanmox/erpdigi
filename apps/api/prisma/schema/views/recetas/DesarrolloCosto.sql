SELECT
  d.id_desarrollo,
  d.codigo,
  COALESCE(sum((di.consumo * i.costo_promedio)), (0)::numeric) AS costo_insumos,
  (d.minutos_mo * d.costo_mo_minuto) AS costo_mano_obra,
  (COALESCE(sum((di.consumo * i.costo_promedio)), (0)::numeric)
   + (d.minutos_mo * d.costo_mo_minuto)) AS costo_unitario
FROM ((recetas.desarrollos d
   LEFT JOIN recetas.desarrollo_insumos di ON ((di.id_desarrollo = d.id_desarrollo)))
   LEFT JOIN recetas.insumos i ON ((i.id_insumo = di.id_insumo)))
GROUP BY d.id_desarrollo;
