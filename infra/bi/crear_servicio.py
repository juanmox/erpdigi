"""Crea la cuenta de servicio con la que la API del ERP pide guest tokens a Superset.

Es un usuario de Superset cuyo rol (`ERPServicio`) SOLO puede emitir guest
tokens: no ve tableros, no edita nada y no administra usuarios. Si la API del ERP
se comprometiera, lo máximo que esta cuenta permite es pedir accesos a tableros
ya incrustados — nunca leer ni cambiar su contenido.

Idempotente. Contraseña en la variable de entorno SUPERSET_SERVICE_PASSWORD
(usuario: SUPERSET_SERVICE_USER, por defecto `erp_servicio`).

  docker exec -i -e SUPERSET_SERVICE_PASSWORD=... digitexsa-bi-superset-1 python - < infra/bi/crear_servicio.py
"""
import os

os.environ.setdefault("SUPERSET_CONFIG_PATH", "/app/pythonpath/superset_config.py")

from superset.app import create_app  # noqa: E402

app = create_app()
with app.app_context():
    from superset import db, security_manager as sm  # noqa: E402

    usuario = os.environ.get("SUPERSET_SERVICE_USER", "erp_servicio")
    clave = os.environ["SUPERSET_SERVICE_PASSWORD"]

    rol = sm.find_role("ERPServicio") or sm.add_role("ERPServicio")
    # `can grant guest token` es lo único imprescindible; `can read on
    # SecurityRestApi` cubre el endpoint del token CSRF que pide el guest_token.
    pedidos = [
        ("can_grant_guest_token", "SecurityRestApi"),
        ("can_read", "SecurityRestApi"),
    ]
    permisos = []
    for permiso, vista in pedidos:
        pv = sm.find_permission_view_menu(permiso, vista)
        if pv is None:
            raise SystemExit(f"No existe el permiso {permiso} sobre {vista}")
        permisos.append(pv)
    rol.permissions = permisos
    db.session.merge(rol)
    db.session.commit()

    existente = sm.find_user(username=usuario)
    if existente is None:
        sm.add_user(
            username=usuario,
            first_name="ERP",
            last_name="Servicio",
            email=f"{usuario}@localhost",
            role=rol,
            password=clave,
        )
        print(f"usuario {usuario}: creado")
    else:
        existente.roles = [rol]
        existente.password = None  # se reemplaza abajo
        db.session.commit()
        sm.reset_password(existente.id, clave)
        print(f"usuario {usuario}: ya existía; rol y contraseña actualizados")
    print(f"ERPServicio: {[f'{p.permission.name}/{p.view_menu.name}' for p in permisos]}")
