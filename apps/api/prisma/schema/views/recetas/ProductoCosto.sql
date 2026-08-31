 SELECT p.id_producto,
    p.codigo,
    p.descripcion,
    vd.costo_insumos,
    vd.costo_mano_obra,
    vd.costo_unitario
   FROM recetas.productos p
     JOIN recetas.desarrollos d ON d.codigo::text = p.desarrollo::text
     JOIN recetas.v_desarrollo_costo vd ON vd.id_desarrollo = d.id_desarrollo;
