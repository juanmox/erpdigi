-- Revierte 20261015160000_subcliente_ua_sin_guion.
UPDATE recetas.productos SET id_subcliente = NULL
 WHERE codigo = 'UABBGTWSH1'
   AND id_subcliente = (SELECT id_subcliente FROM recetas.subclientes WHERE codigo = '411');
