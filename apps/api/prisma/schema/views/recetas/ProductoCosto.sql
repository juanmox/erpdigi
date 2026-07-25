SELECT
  p.id_producto,
  p.codigo,
  p.descripcion,
  COALESCE(
    sum((pi.consumo * i.costo_promedio)),
    (0) :: numeric
  ) AS costo_insumos,
  (p.minutos_mo * p.costo_mo_minuto) AS costo_mano_obra,
  (
    COALESCE(
      sum((pi.consumo * i.costo_promedio)),
      (0) :: numeric
    ) + (p.minutos_mo * p.costo_mo_minuto)
  ) AS costo_unitario
FROM
  (
    (
      recetas.productos p
      LEFT JOIN recetas.producto_insumos pi ON ((pi.id_producto = p.id_producto))
    )
    LEFT JOIN recetas.insumos i ON ((i.id_insumo = pi.id_insumo))
  )
GROUP BY
  p.id_producto;