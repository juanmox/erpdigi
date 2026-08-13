-- Campo de texto libre pedido por el usuario tras revisar F3 (sesión F3,
-- observaciones post-revisión) — corresponde al campo "OBSERVACIONES" de la
-- Requisición de Bodega física que ya usan (ver foto de referencia), donde
-- hoy anotan a mano contexto que no cabe en ningún campo estructurado (ej.
-- motivo detallado, responsables mencionados en prosa).
ALTER TABLE "costeo"."reposicion" ADD COLUMN "comentario" TEXT;
