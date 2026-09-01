-- Rollback de 20260831190000_talla_frecuente.
-- Solo quita la columna de presentación; no toca las tallas ni su grupo.
ALTER TABLE "recetas"."tallas" DROP COLUMN "frecuente";
