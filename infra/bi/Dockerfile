# Superset oficial + driver de PostgreSQL + traducción al español.
# La imagen oficial no trae el driver (ni para sus propios metadatos ni para leer la base
# del ERP) y viene SIN archivos de traducción: las carpetas `translations/*` están vacías,
# así que toda la interfaz sale en inglés aunque se configure el idioma. Los archivos
# (`messages.mo` del servidor y `messages.json` de la interfaz) se toman del paquete fuente
# de la MISMA versión. Se fija la versión de Superset para que no cambie sola.
#
# En el servidor (pip install apache-superset) no hace falta nada de esto: el paquete de
# PyPI ya trae las traducciones.
FROM apache/superset:6.0.0

USER root
RUN uv pip install --python /app/.venv/bin/python psycopg2-binary==2.9.10 \
 && mkdir /tmp/t && cd /tmp/t \
 && pip download apache-superset==6.0.0 --no-deps -q \
 && tar xzf apache_superset-6.0.0.tar.gz --wildcards 'apache_superset-6.0.0/superset/translations/es/*' \
 && mkdir -p /app/superset/translations/es \
 && cp -r apache_superset-6.0.0/superset/translations/es/. /app/superset/translations/es/ \
 && rm -rf /tmp/t
USER superset
