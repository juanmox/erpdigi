"""Crea el rol `ERPGuest`, el que Superset aplica a TODOS los usuarios incrustados,
y deja el rol `Public` con el ÚNICO permiso necesario para la traducción.

`ERPGuest` parte de los permisos de Gamma (consultar tableros y gráficos) y retira de
forma EXPLÍCITA lo que no corresponde a quien solo consulta: ver o editar la consulta
de un gráfico, exportar definiciones, SQL Lab y consultas guardadas. Es idempotente.

Ejecutar dentro del contenedor/entorno de Superset:
  docker exec -i digitexsa-bi-superset-1 python - < infra/bi/crear_rol_guest.py

La DESCARGA de datos (`can_csv`, el menú Excel/CSV) se conserva a propósito:
es lo que permite exportar desde los tableros. Pero ⚠️ Superset aplica UN solo
rol guest a todos los usuarios incrustados, así que no hay forma de dar la
descarga a unos y quitársela a otros con un control real: el ERP oculta el menú
(`hideChartControls`) a quien no tiene `costeo.dashboard.exportar` y siempre en
el tablero de costos, pero eso es un control de PANTALLA. Un usuario técnico con
un token de acceso podría pedir la descarga directamente. Por eso los datos
realmente sensibles no deben depender solo de esto.

Se retira por lista de pares (permiso, vista) y no por palabras: una primera
versión filtraba por texto ("csv", "export", "query") y quitó también la
descarga que sí se quería, y dejó "Edit chart" y "View query" visibles.

⚠️ Idioma: el navegador pide el paquete de traducción (`/superset/language_pack/es/`)
SIN el token del usuario incrustado, o sea como visitante anónimo. Sin permiso,
Superset lo redirige al login y TODA la interfaz queda en inglés sin ningún error
visible. Por eso (con `AUTH_ROLE_PUBLIC = "Public"` en superset_config.py) el rol
Public recibe ese único permiso: solo sirve un archivo de traducción, ningún dato.
"""
import os

os.environ.setdefault("SUPERSET_CONFIG_PATH", "/app/pythonpath/superset_config.py")

from superset.app import create_app  # noqa: E402

app = create_app()
with app.app_context():
    from superset import db, security_manager as sm  # noqa: E402

    NOMBRE = "ERPGuest"
    RETIRAR = {
        # Ver la consulta SQL de un gráfico y exportar sus definiciones.
        ("can_view_query", "Dashboard"),
        ("can_export", "Chart"),
        ("can_export", "Dashboard"),
        # Abrir el gráfico en el explorador ("Edit chart").
        ("can_explore", "Superset"),
        # Todo lo de SQL Lab y consultas guardadas.
        ("can_estimate_query_cost", "SQLLab"),
        ("can_format_sql", "SQLLab"),
        ("can_list", "SavedQuery"),
    }

    gamma = sm.find_role("Gamma")
    if gamma is None:
        raise SystemExit("No existe el rol Gamma: ¿corrió `superset init`?")

    rol = sm.find_role(NOMBRE) or sm.add_role(NOMBRE)
    permitidos = [
        pv for pv in gamma.permissions if (pv.permission.name, pv.view_menu.name) not in RETIRAR
    ]
    rol.permissions = permitidos
    db.session.merge(rol)

    pv_idioma = sm.find_permission_view_menu("can_language_pack", "Superset")
    if pv_idioma is None:
        raise SystemExit("No existe el permiso can_language_pack sobre Superset")
    publico = sm.find_role("Public") or sm.add_role("Public")
    publico.permissions = [pv_idioma]
    db.session.merge(publico)
    db.session.commit()
    print(
        f"{NOMBRE}: {len(permitidos)} permisos (Gamma tiene {len(gamma.permissions)}); "
        f"retirados: {len(RETIRAR)}. Public: solo {pv_idioma.permission.name}."
    )
