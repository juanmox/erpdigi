-- F1/F3 modeló "desarrollo" como campo único de costeo.orden_produccion,
-- asumiendo un solo valor por OP. Impresiones reales de OP del sistema
-- actual (26OP010439, 26OP022119) confirman que una misma OP siempre trae
-- varios Desarrollo distintos, uno por línea/registro — el dato pertenece a
-- costeo.linea_produccion, no a la orden completa. La columna vieja nunca
-- tuvo datos reales en uso (F3 aún no tenía import con volumen real).
ALTER TABLE "costeo"."orden_produccion" DROP COLUMN "desarrollo";
ALTER TABLE "costeo"."linea_produccion" ADD COLUMN "desarrollo" VARCHAR(40);
