-- Ubicación física de los rollos de papel: solo "¿en qué sitio está parado
-- este rollo?" — Digitexsa o DigitalPro. NO es el módulo de inventario
-- completo (ver docs/05-INVENTARIO-POR-BODEGA.md, que quedó pausado): nada de
-- movimientos, traslados, ajustes, ni insumos/tela. Solo rollos.
--
-- Decisión del usuario (2026-10-20): las dos ubicaciones difieren por
-- distancia física, no por tenencia — mismo criterio ya establecido el
-- 2026-09-28 (planta compartida, equipos compartidos). Por eso `id_empresa`
-- en `ubicacion` es NULLABLE y solo informativo (para heredar el color de
-- marca en pantalla), nunca un filtro de acceso.
--
-- ⚠️ Se llama `costeo.ubicacion` y NO `costeo.bodega` a propósito: ese nombre
-- queda libre para cuando llegue el módulo completo, que va a incluir también
-- "Bodega de Materiales" (sin ubicación física única, por insumos fungibles,
-- no por rollos serializados) — un concepto más rico que este.

CREATE TABLE costeo.ubicacion (
  id_ubicacion serial PRIMARY KEY,
  codigo       varchar(20) NOT NULL,
  nombre       varchar(60) NOT NULL,
  -- Opcional y solo informativo (ver nota de arriba). ON DELETE SET NULL: si
  -- algún día se borra una empresa, la ubicación sigue existiendo como sitio
  -- físico — no tiene sentido que arrastre el borrado.
  id_empresa   integer,
  activo       boolean NOT NULL DEFAULT true,
  creado_en    timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT ubicacion_codigo_key UNIQUE (codigo),
  CONSTRAINT ubicacion_id_empresa_fkey FOREIGN KEY (id_empresa)
    REFERENCES core.empresas (id_empresa) ON DELETE SET NULL
);

INSERT INTO costeo.ubicacion (codigo, nombre, id_empresa)
SELECT 'DIGITEXSA', 'Digitexsa', id_empresa FROM core.empresas WHERE codigo = 'DIGITEXSA'
UNION ALL
SELECT 'DIGITALPRO', 'DigitalPro', id_empresa FROM core.empresas WHERE codigo = 'CASTA';

-- El rollo, no la factura: cada rollo ya tiene identidad propia
-- (`777-10-3`) y ya se corrige yardas/costo uno por uno en "Corregir
-- ingreso" — la ubicación sigue ese mismo criterio de granularidad.
--
-- NULLABLE a propósito: los 235 rollos que ya existen no tienen de dónde
-- sacar su ubicación (no hay dato en el sistema que lo diga), así que
-- arrancan sin clasificar. Se asignan a mano, por rango, con el endpoint
-- nuevo — nada se infiere solo.
ALTER TABLE costeo.rollo_papel
  ADD COLUMN id_ubicacion integer;

ALTER TABLE costeo.rollo_papel
  ADD CONSTRAINT rollo_papel_id_ubicacion_fkey FOREIGN KEY (id_ubicacion)
    REFERENCES costeo.ubicacion (id_ubicacion) ON DELETE RESTRICT;

CREATE INDEX idx_rollo_papel_id_ubicacion ON costeo.rollo_papel (id_ubicacion);
