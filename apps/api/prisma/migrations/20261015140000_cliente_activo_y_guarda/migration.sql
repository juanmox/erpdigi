-- Paso 3 del saneamiento de clientes (ver 20261015120000_subclientes).
--
-- Dos cosas, y la segunda es la que de verdad importa.

-- 1. `activo`: hasta ahora un cliente mal creado solo se podía BORRAR, porque
--    no había forma de retirarlo. Borrar es lo que obliga a repuntar todo su
--    histórico; retirar deja los datos donde están y solo lo saca de los
--    selectores. Es lo que debió existir cuando se creó UNDER ARMOUR por error.
ALTER TABLE recetas.clientes
  ADD COLUMN activo boolean NOT NULL DEFAULT true;

-- 2. ⚠️ `costeo.orden_produccion.id_cliente` era la ÚNICA FK hacia clientes con
--    ON DELETE SET NULL. Las otras cuatro (productos, desarrollos,
--    orden_facturacion, subclientes) bloquean. O sea que borrar un cliente no
--    fallaba: vaciaba el cliente de todas sus órdenes, en silencio.
--
--    No es hipotético: al fusionar UNDER ARMOUR, borrarlo antes de repuntar
--    habría dejado 725 OP sin cliente en local (765 en producción). Lo frenó
--    una guarda escrita a mano en el script, que es exactamente la clase de
--    protección que no hay que depender de recordar.
--
--    Con RESTRICT la base rechaza el borrado y obliga a repuntar primero. Las
--    OP que YA tienen id_cliente NULL (7 en local, de la migración del legacy)
--    no se ven afectadas: RESTRICT mira las referencias, no los nulos.
ALTER TABLE costeo.orden_produccion
  DROP CONSTRAINT orden_produccion_id_cliente_fkey;
ALTER TABLE costeo.orden_produccion
  ADD CONSTRAINT orden_produccion_id_cliente_fkey
  FOREIGN KEY (id_cliente) REFERENCES recetas.clientes(id_cliente)
  ON UPDATE CASCADE ON DELETE RESTRICT;
