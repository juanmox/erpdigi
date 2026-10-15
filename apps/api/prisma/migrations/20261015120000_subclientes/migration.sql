-- Subclientes: divisiones o marcas que cuelgan de un cliente y NO se facturan
-- aparte. Nace de Under Armour, que había entrado como cliente (411) por no
-- tener dónde más ir; se factura a BSN SPORTS y el catálogo autoritativo de 99
-- clientes nunca lo tuvo.
--
-- ⚠️ Va por cliente (UNIQUE (id_cliente, nombre)) y NO global, al revés que
-- `costeo.linea_producto` en 2026-10-09. La diferencia tiene razón: un tipo de
-- prenda es universal —un "Jersey" es un jersey para cualquiera—, pero una
-- división pertenece a su casa matriz. Si Under Armour llegara a entrar por
-- otro cliente, es otra fila, porque es otra relación comercial.
--
-- ⚠️ El vínculo vive en el PRODUCTO y no en la orden. Medido sobre los datos
-- reales: 38 órdenes mezclan prendas UA con prendas BSN directas (1,425 piezas
-- contra 923 dentro de las MISMAS órdenes), así que una etiqueta por orden
-- tendría que elegir un bando y misatribuiría uno de los dos montos. Es el
-- mismo criterio que puso el deporte en el producto.

CREATE TABLE recetas.subclientes (
  id_subcliente serial       PRIMARY KEY,
  id_cliente    integer      NOT NULL,
  -- Código opcional, único entre subclientes. Es lo que permite que la
  -- plantilla de Órdenes siga aceptando el `411` que ya traen los archivos
  -- armados: el import lo resuelve al cliente padre y avisa en el preview.
  codigo        varchar(20),
  nombre        varchar(150) NOT NULL,
  activo        boolean      NOT NULL DEFAULT true,
  creado_en     timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT subclientes_id_cliente_fkey FOREIGN KEY (id_cliente)
    REFERENCES recetas.clientes(id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT subclientes_cliente_nombre_key UNIQUE (id_cliente, nombre),
  CONSTRAINT subclientes_codigo_key UNIQUE (codigo),
  CONSTRAINT ck_subclientes_nombre_no_vacio CHECK (btrim(nombre) <> ''),
  CONSTRAINT ck_subclientes_codigo_no_vacio CHECK (codigo IS NULL OR btrim(codigo) <> '')
);

CREATE INDEX idx_subclientes_cliente ON recetas.subclientes(id_cliente);

ALTER TABLE recetas.productos ADD COLUMN id_subcliente integer;
ALTER TABLE recetas.productos ADD CONSTRAINT productos_id_subcliente_fkey
  FOREIGN KEY (id_subcliente) REFERENCES recetas.subclientes(id_subcliente)
  ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX idx_productos_subcliente ON recetas.productos(id_subcliente)
  WHERE id_subcliente IS NOT NULL;

-- Under Armour, bajo BSN SPORTS, conservando el código 411 que ya viaja en las
-- plantillas. Resuelto por código y nombre, nunca por id: difieren por ambiente.
DO $$
DECLARE v_bsn int; v_sub int; n int;
BEGIN
  SELECT id_cliente INTO v_bsn FROM recetas.clientes WHERE codigo = '181' AND nombre = 'BSN SPORTS';
  IF v_bsn IS NULL THEN
    RAISE EXCEPTION 'No existe el cliente 181 BSN SPORTS: no se puede colgar el subcliente';
  END IF;

  -- El alias solo es inequívoco si ningún cliente usa ese mismo código.
  IF EXISTS (SELECT 1 FROM recetas.clientes WHERE codigo = '411') THEN
    RAISE EXCEPTION 'El código 411 todavía existe como cliente; fusionalo antes (ver fusionar-under-armour-en-bsn.sql)';
  END IF;

  INSERT INTO recetas.subclientes (id_cliente, codigo, nombre)
  VALUES (v_bsn, '411', 'Under Armour')
  RETURNING id_subcliente INTO v_sub;

  -- Backfill: el prefijo del código es hoy el único marcador de la marca (solo
  -- 4 de los 43 la nombran en la descripción). Por eso el paso siguiente es que
  -- el campo sea visible al dar de alta un producto: uno nuevo sin marcar caería
  -- en "BSN directo" y la estadística quedaría corta sin ninguna señal.
  UPDATE recetas.productos SET id_subcliente = v_sub
  WHERE codigo ~* '^(UA|YUA)[-_]';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Subcliente Under Armour creado; % productos marcados', n;

  -- Un producto de un subcliente tiene que ser del cliente padre.
  IF EXISTS (
    SELECT 1 FROM recetas.productos p JOIN recetas.subclientes s USING (id_subcliente)
    WHERE p.id_cliente IS DISTINCT FROM s.id_cliente
  ) THEN
    RAISE EXCEPTION 'Hay productos cuyo subcliente pertenece a otro cliente';
  END IF;
END $$;
