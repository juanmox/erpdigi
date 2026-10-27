"""Configuración de Superset para los tableros del ERP.

Los secretos NO viven acá: vienen del entorno (infra/bi/.env.local en local; en el
servidor, del archivo de entorno del servicio systemd, fuera del repositorio).
"""
import os

SECRET_KEY = os.environ["SUPERSET_SECRET_KEY"]

# Metadatos de Superset (tableros, gráficos, usuarios de Superset): base propia,
# separada de la base del ERP.
SQLALCHEMY_DATABASE_URI = (
    f"postgresql+psycopg2://superset:{os.environ['SUPERSET_DB_PASSWORD']}"
    f"@{os.environ.get('SUPERSET_DB_HOST', 'superset-db')}:5432/superset"
)

# Solo español, a propósito: con más idiomas listados Superset elige por el idioma del
# NAVEGADOR de cada usuario (un Windows en inglés vería todo en inglés). Con uno solo, no
# hay nada que elegir.
LANGUAGES = {"es": {"flag": "es", "name": "Español"}}
BABEL_DEFAULT_LOCALE = "es"

# Visitante anónimo = rol Public, que solo puede pedir el archivo de traducción (ver
# crear_rol_guest.py). Sin esto la interfaz incrustada se queda en inglés.
AUTH_ROLE_PUBLIC = "Public"

# ── Caché de consultas ──────────────────────────────────────────────
# Un tablero lanza 10-15 consultas a la vez; con caché, ver el mismo tablero otra vez en
# los próximos minutos es casi instantáneo. El costo es que los datos pueden tener hasta 5
# minutos de antigüedad ("Forzar actualización" en el menú del gráfico los refresca).
# La clave de caché incluye la regla por fila de la empresa: dos empresas nunca comparten
# resultados. Archivos locales (un solo servidor); con varias instancias, Redis.
_CACHE = {
    "CACHE_TYPE": "FileSystemCache",
    "CACHE_DIR": "/app/superset_home/cache",
    "CACHE_DEFAULT_TIMEOUT": 300,
}
CACHE_CONFIG = _CACHE
DATA_CACHE_CONFIG = _CACHE

# ── Incrustación dentro del ERP ─────────────────────────────────────
# El ERP (backend) pide un "guest token" por usuario, con la regla por fila de
# su empresa; el navegador solo recibe ese token, nunca credenciales de Superset.
FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
    "DASHBOARD_RBAC": True,
}
GUEST_ROLE_NAME = "ERPGuest"  # rol mínimo, se crea en la configuración inicial
GUEST_TOKEN_JWT_SECRET = os.environ["GUEST_TOKEN_JWT_SECRET"]
GUEST_TOKEN_JWT_ALGO = "HS256"
GUEST_TOKEN_HEADER_NAME = "X-GuestToken"
GUEST_TOKEN_JWT_EXP_SECONDS = 300

ERP_ORIGEN = os.environ.get("ERP_ORIGEN", "http://localhost:5173")

# Quién puede enmarcar Superset en un iframe: solo el ERP.
TALISMAN_ENABLED = True
TALISMAN_CONFIG = {
    "content_security_policy": {
        "base-uri": ["'self'"],
        "default-src": ["'self'"],
        "img-src": ["'self'", "blob:", "data:"],
        "worker-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "object-src": "'none'",
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'", "'strict-dynamic'"],
        "frame-ancestors": ["'self'", ERP_ORIGEN],
    },
    "content_security_policy_nonce_in": ["script-src"],
    "force_https": False,
    "session_cookie_secure": False,
}

# Cookies: el ERP y Superset corren en puertos distintos del mismo host.
SESSION_COOKIE_SAMESITE = "Lax"
ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources": ["*"],
    "origins": [ERP_ORIGEN],
}

# ── Exportación ─────────────────────────────────────────────────────
# Tope de filas por descarga (CSV/Excel). El volumen total del ERP es chico
# (decenas de miles de filas), esto deja holgura sin permitir volcados absurdos.
ROW_LIMIT = 50000
SQL_MAX_ROW = 100000

# ── Paleta de la marca ──────────────────────────────────────────────
# Azul corporativo (#203080) y dorado varsity (#c08a25) primero; el resto son
# tonos distinguibles entre sí (también para quien distingue mal los colores).
EXTRA_CATEGORICAL_COLOR_SCHEMES = [
    {
        "id": "digitexsa",
        "description": "Paleta Digitexsa",
        "label": "Digitexsa",
        "isDefault": True,
        "colors": [
            "#203080", "#c08a25", "#2a9d8f", "#e76f51", "#6c5ce7",
            "#8d99ae", "#0f766e", "#d62828", "#4361ee", "#f4a261",
        ],
    }
]
