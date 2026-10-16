-- Marca `UABBGTWSH1` como Under Armour.
--
-- El backfill de 20261015120000_subclientes resuelve la marca por el prefijo
-- del código (`UA-` / `YUA-`), que es el único marcador que existe: solo 4 de
-- los 43 productos nombran la marca en su descripción. Este se escapó porque
-- está escrito SIN el guion.
--
-- Confirmado por el usuario (2026-10-15) y verificado antes de escribirlo: es
-- el único caso en todo el catálogo, no tiene gemelo con guion —o sea no es un
-- duplicado sino el código real— y sigue la convención de los demás
-- (`UA` + `BB` basketball + `GT` gametime + `W` women + `SH` short), igual que
-- `UA-BBGTMSH1`. Se usa en 85 líneas de producción en producción y 62 en local.
--
-- Va en su propia migración y no corrigiendo la del backfill: esa ya está
-- aplicada, y una migración aplicada no se edita.
--
-- ⚠️ No aborta si el producto no existe: este es un arreglo de DATOS puntual,
-- y un ambiente donde no esté (una base nueva, por ejemplo) no tiene por qué
-- quedarse sin poder migrar.
DO $$
DECLARE v_sub int; v_cli int; n int;
BEGIN
  SELECT s.id_subcliente, s.id_cliente INTO v_sub, v_cli
  FROM recetas.subclientes s WHERE s.codigo = '411';
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'No existe el subcliente 411: esta migración va después de 20261015120000_subclientes';
  END IF;

  -- Solo si pertenece al mismo cliente que el subcliente: un producto de otro
  -- cliente con ese código sería otra cosa, y marcarlo mezclaría clientes en
  -- la estadística.
  UPDATE recetas.productos
     SET id_subcliente = v_sub
   WHERE codigo = 'UABBGTWSH1' AND id_cliente = v_cli AND id_subcliente IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'UABBGTWSH1 marcado como Under Armour: % fila(s)', n;
END $$;
