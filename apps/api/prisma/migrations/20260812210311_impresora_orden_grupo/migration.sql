-- Orden de despliegue fijo y agrupación para el panel de estado de
-- impresoras, a pedido del usuario (sesión F3): MS 1-6, MP 7-8, RG NEXT/ONE,
-- Mimaki 3-6 (nunca alfabético), en dos grupos colapsables — MS_DT (MS/MP) y
-- DP (RG NEXT/ONE + Mimaki). Los valores reales se llenan en el seed.
ALTER TABLE "costeo"."impresora"
  ADD COLUMN "orden" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "grupo" VARCHAR(20);
