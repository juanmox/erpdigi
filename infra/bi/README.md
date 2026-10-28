# Tableros gerenciales (Apache Superset) incrustados en el ERP

Superset (Apache 2.0, sin versión de pago) corre como un servicio aparte, lee solo el
schema `analitica` con un rol de solo lectura y se muestra **dentro del ERP**: la API del
ERP decide quién ve qué y fija la empresa de la sesión. Nada sale a terceros (telemetría
apagada, `SCARF_ANALYTICS=false`).

```
PostgreSQL ──► schema `analitica` (vistas) ◄── rol bi_lector (solo SELECT)
                                   │
                          Superset (base `superset` propia)
                                   │  guest token (lo emite la API del ERP)
              ERP: /dashboards ◄──┘   permiso por tablero + regla por fila id_empresa
```

## Qué hay en el repositorio

| Ruta | Para qué |
|---|---|
| `apps/api/prisma/migrations/20261025120000_analitica_vistas/` | Schema `analitica` y sus 8 vistas (+ `rollback.sql`) |
| `apps/api/src/modules/bi/` | Catálogo de tableros (`tableros.ts`), permisos y emisión del guest token |
| `apps/web/src/features/bi/` | Pantalla `/dashboards` (menú "Dashboards") con el SDK de incrustación |
| `infra/bi/crear-rol-bi-lector.sql` | Rol de solo lectura (lo corre un superusuario) |
| `infra/bi/docker-compose.superset.yml`, `Dockerfile` | Superset para DESARROLLO local (Docker) |
| `infra/bi/superset_config.py` | Configuración de Superset (secretos por entorno) |
| `infra/bi/configurar-superset.mjs` | Conexión a la base y un dataset por vista |
| `infra/bi/crear_rol_guest.py`, `crear_servicio.py` | Rol de los usuarios incrustados y cuenta de servicio |
| `infra/bi/tableros/construir-tableros.mjs` | Primera tanda de 5 tableros (Producción, Calidad, Papel, Facturación, Costos) |
| `infra/bi/servidor/` | Alternativa con `systemd` (pide `sudo`, usuario y `python3-venv`); la guía de abajo usa PM2 y no la necesita |

## Reglas que conviene no romper

- **Los tableros leen `analitica`, nunca las tablas.** Ahí están las reglas del ERP una sola vez
  (sin anulados, hora de Guatemala, papel = impresión + enguiamiento + en blanco + reposiciones).
  `v_consumo` excluye `origen = REPOSICION` y las reposiciones salen de `v_reposiciones`: sumar
  `consumo_papel` crudo más reposiciones cuenta dos veces.
- **Dinero solo en vistas `*_costo`** (`v_rollos_costo`, `v_facturacion_costo`, `v_costo_op`).
- **Un tablero no mezcla datasets con y sin `id_empresa`.** La regla por fila se aplica a todos los
  datasets del tablero; `v_rollos` no la lleva (planta compartida), por eso `papel` tiene
  `filtraPorEmpresa: false` en `tableros.ts`.
- ⚠️ **La descarga a Excel/CSV es un control de pantalla, no un gate real.** Superset aplica un solo
  rol (`ERPGuest`) a todos los incrustados. El ERP oculta el menú a quien no tiene
  `costeo.dashboard.exportar` y siempre en `costos` (`sinDescarga`), pero quien maneje su token a
  mano podría pedirla. Lo sensible se exporta por reportes del ERP.
- **Editar tableros** se hace en Superset con cuenta propia (rol Alpha). Quien entra desde el ERP
  nunca edita.
- `construir-tableros.mjs` **no toca tableros que ya existen**: el equipo los edita en Superset.
  `--recrear <clave|todos>` los borra y rehace (pierde esas ediciones) y cambia los UUID.

## Idioma y velocidad

- **Español**: la imagen oficial de Superset viene SIN archivos de traducción (las carpetas están
  vacías), así que todo salía en inglés. El `Dockerfile` los toma del paquete fuente de la misma
  versión. Además hacen falta dos cosas en la configuración, y sin cualquiera de ellas la interfaz
  incrustada vuelve a inglés **sin ningún error visible**: `LANGUAGES` con solo `es` (si no, manda el
  idioma del navegador de cada usuario) y el rol `Public` con el permiso `can_language_pack`
  (`crear_rol_guest.py`; el navegador pide el paquete de idioma sin el token del usuario). En el
  servidor, `pip install apache-superset` ya trae las traducciones.
- **Caché de consultas** de 5 minutos (`superset_config.py`): los datos pueden tener hasta 5 min de
  antigüedad; el menú del gráfico tiene "Forzar actualización". La clave de caché incluye la regla por
  fila de la empresa: verificado que Digitalpro nunca recibe resultados guardados de Digitexsa.
- Tiempos medidos en local: primera carga ~2.7 s, con caché ~1.5 s (la tabla de costos tardaba
  15 s antes de reescribir `v_costo_op`). Parte de la espera es el JavaScript de Superset (~2.3 MB,
  37 archivos), que el navegador guarda tras la primera visita.

## Desarrollo local

```bash
# 1) Postgres del ERP ya corriendo (docker-compose.dev.yml). Migración + rol de lectura:
pnpm --filter @digitexsa-erp/api exec prisma migrate deploy
docker exec -i docker-postgres-1 psql -U digitexsa -d digitexsa_erp_dev \
  -v clave="'<BI_LECTOR_PASSWORD>'" < infra/bi/crear-rol-bi-lector.sql

# 2) Superset (proyecto propio, puerto 8088, volumen propio)
docker compose -p digitexsa-bi -f infra/bi/docker-compose.superset.yml --env-file infra/bi/.env.local up -d --build

# 3) Configuración inicial (una vez)
node --env-file=infra/bi/.env.local infra/bi/configurar-superset.mjs
docker exec -i digitexsa-bi-superset-1 python - < infra/bi/crear_rol_guest.py
docker exec -i -e SUPERSET_SERVICE_PASSWORD=... digitexsa-bi-superset-1 python - < infra/bi/crear_servicio.py
node --env-file=infra/bi/.env.local infra/bi/tableros/construir-tableros.mjs --escribir-env apps/api/.env

# 4) Reiniciar la API (lee el .env solo al arrancar) y sembrar el permiso nuevo
pnpm --filter @digitexsa-erp/api exec prisma db seed
```

`infra/bi/.env.local` (ignorado por git) trae todos los secretos. Variables de la API
(`apps/api/.env`): `SUPERSET_URL`, `SUPERSET_PUBLIC_URL`, `SUPERSET_SERVICE_USER`,
`SUPERSET_SERVICE_PASSWORD`, `BI_TABLEROS` — ver `.env.example`. Sin ellas el módulo queda inerte:
el menú "Dashboards" no aparece.

**El menú exige además el permiso `plataforma.tableros.acceder`** (interruptor del módulo), que solo ADMIN
recibe de fábrica. Se pide *además* del permiso de cada tablero (`costeo.dashboard.ver` / `ver_financiero`):
aunque Superset esté instalado y configurado, nadie más ve el menú, ni obtiene tokens, hasta que se asigne
desde `/roles`. Sin él, además, `/dashboards` redirige a Inicio.

## Servidor de producción (sin Docker) — pendiente de ejecutar

Guía para instalar Superset en `192.168.2.13` **sin tocar los procesos en marcha**. Todo vive en
`~/superset` (usuario `erpadmin`) y corre bajo **PM2**, igual que `digitexsa-api`; así no hace
falta `systemd` ni crear usuarios del sistema. Solo **dos pasos piden `sudo`**: crear los roles de
Postgres (paso 3) y, si está activo, abrir el puerto en `ufw` (paso 6).

**Por qué es transparente para quien usa el ERP**: hasta el paso 8 no se toca la API ni la base
`erpdb` (el paso 3 solo agrega un rol y una base nueva). La instalación pesada corre con `nice`.
Superset ocupa entre 0.5 y 1 GB de RAM según uso (el servidor tiene ~5.6 GB libres) y un puerto nuevo (8088). El único
instante visible es el reinicio de la API del paso 8, de 1-2 s, que conviene hacer fuera de horas pico.

### Lo que se descubrió probando esta guía (no repetir el tropiezo)

- **El servidor tiene Python 3.14**, y Superset 6.0 solo soporta 3.10–3.12. Además no trae
  `python3-venv`. Por eso se usa `uv`, que baja un Python 3.11 propio **sin sudo** y no toca el del sistema.
- **No hay compilador (`gcc`)**. `apache-superset==6.0.0` solo se publica como código fuente, pero es
  Python puro y todas sus dependencias traen binarios: se instaló en un Linux limpio sin compilador.
- **Hay que instalar `rich` aparte**: el paquete de PyPI no lo declara y sin él el comando
  `superset` se cae (`ModuleNotFoundError: rich`). La imagen de Docker sí lo trae, por eso en local no se vio.
- **`crear-rol-bi-lector.sql` ya NO hace `REVOKE ... FROM PUBLIC`** sobre la base: no aporta nada y toca una
  base en producción. (Se quitó creyendo que `erpadmin` entraba solo por ese `CONNECT`; al verificar el
  servidor resultó que `erpadmin` ya no posee nada en `erpdb`, pero se dejó quitado igual.)

### Orden (no se avanza si un paso falla)

**0. Chequeo y traer los archivos corregidos.** `git pull` solo baja el código: no recompila ni reinicia nada.
La guarda de la 3.ª línea es importante: el script viejo del rol de lectura quita el `CONNECT` público de `erpdb`.
```bash
free -m; df -h ~; ss -ltn | grep ':8088' || echo "8088 libre"
cd ~/digitexsa-erp && git pull
grep -q "REVOKE ALL ON DATABASE %I" infra/bi/crear-rol-bi-lector.sql && echo "¡NO CONTINUAR: script viejo!" || echo "script OK"
```

**1. Python 3.11 y Superset en su propia carpeta** (`erpadmin`, sin sudo, ~5 min, ocupa ~700 MB de disco).
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.11
mkdir -p ~/superset && uv venv ~/superset/venv --python 3.11
nice -n 19 uv pip install --python ~/superset/venv/bin/python \
  apache-superset==6.0.0 psycopg2-binary==2.9.10 gunicorn rich
~/superset/venv/bin/python -c "import psycopg2, rich, gunicorn; from importlib.metadata import version; print('Superset', version('apache-superset'))"
```
Debe imprimir `Superset 6.0.0`. (No usar `superset version` aquí: sin configuración se niega a arrancar por la `SECRET_KEY` por defecto, y parece un fallo.)

**2. Secretos y configuración.** Los genera el propio servidor y quedan solo en `~/superset/superset.env`
(modo 600); no se escriben en ningún otro lado ni pasan por el repositorio. Son hexadecimales a propósito
(la contraseña de la base va dentro de una URL).
```bash
cd ~/superset && mkdir -p cache
install -m 600 /dev/null superset.env
cat > superset.env <<EOF
SUPERSET_SECRET_KEY=$(openssl rand -hex 32)
GUEST_TOKEN_JWT_SECRET=$(openssl rand -hex 32)
SUPERSET_DB_PASSWORD=$(openssl rand -hex 16)
SUPERSET_DB_HOST=localhost
SUPERSET_CACHE_DIR=$HOME/superset/cache
ERP_ORIGEN=http://192.168.2.13
SCARF_ANALYTICS=false
BI_LECTOR_PASSWORD=$(openssl rand -hex 16)
SUPERSET_ADMIN_PASSWORD=$(openssl rand -hex 12)
SUPERSET_SERVICE_PASSWORD=$(openssl rand -hex 16)
EOF
cp ~/digitexsa-erp/infra/bi/superset_config.py ~/superset/superset_config.py
```

**3. Postgres** (**necesita sudo**, ~1 min). Crea el rol de solo lectura y la base propia de Superset.
Después comprueba que `bi_lector` ve `analitica` y NO ve `core`, y que el ERP sigue conectando.
```bash
cd /tmp && set -a && . ~/superset/superset.env && set +a
sudo -u postgres psql -d erpdb -v clave="'$BI_LECTOR_PASSWORD'" \
  < ~/digitexsa-erp/infra/bi/crear-rol-bi-lector.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE superset LOGIN PASSWORD '$SUPERSET_DB_PASSWORD'" \
  -c "CREATE DATABASE superset OWNER superset"

# Verificación — la 1.ª debe dar un número; la 2.ª debe decir "permission denied"; la 3.ª, 1
PGPASSWORD=$BI_LECTOR_PASSWORD psql -h localhost -U bi_lector -d erpdb -Atc "select count(*) from analitica.v_consumo"
PGPASSWORD=$BI_LECTOR_PASSWORD psql -h localhost -U bi_lector -d erpdb -Atc "select count(*) from core.usuarios" 2>&1 | head -1
psql "$(grep ^DATABASE_URL ~/digitexsa-erp/apps/api/.env | cut -d= -f2- | tr -d '"')" -Atc "select 1"
```

**4. Inicializar Superset** (crea sus tablas, el admin, el rol de los incrustados y la cuenta de servicio).
```bash
cd ~/superset && set -a && . ./superset.env && set +a
export SUPERSET_CONFIG_PATH=$HOME/superset/superset_config.py FLASK_APP=superset PATH=$HOME/superset/venv/bin:$PATH
superset db upgrade
superset fab create-admin --username admin --firstname Admin --lastname ERP \
  --email admin@localhost --password "$SUPERSET_ADMIN_PASSWORD"
superset init
python - < ~/digitexsa-erp/infra/bi/crear_rol_guest.py
python - < ~/digitexsa-erp/infra/bi/crear_servicio.py
```

**5. Dejarlo corriendo con PM2** (arranca solo al reiniciar el servidor, como las otras apps).
```bash
cat > ~/superset/run.sh <<'EOF'
#!/bin/bash
set -a; . "$HOME/superset/superset.env"; set +a
export SUPERSET_CONFIG_PATH="$HOME/superset/superset_config.py"
exec "$HOME/superset/venv/bin/gunicorn" --workers 2 --worker-class gthread --threads 4 \
  --timeout 120 --bind 0.0.0.0:8088 "superset.app:create_app()"
EOF
chmod +x ~/superset/run.sh
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
pm2 start ~/superset/run.sh --name superset --interpreter bash --cwd ~/superset --max-memory-restart 1500M
pm2 save
sleep 20; curl -s http://127.0.0.1:8088/health     # debe responder OK
```

**6. Puerto 8088 para los navegadores** (**sudo**; solo si `ufw` está activo). Los usuarios abren el ERP en
`http://192.168.2.13` y el tablero se carga desde `http://192.168.2.13:8088`, así que su PC tiene que llegar a ese puerto.
```bash
sudo ufw status
sudo ufw allow from 192.168.2.0/24 to any port 8088 proto tcp     # solo si dice "Status: active"
```
Prueba desde una PC de la red: abrir `http://192.168.2.13:8088/health`.

**7. Datasets y tableros.** `--escribir-env` deja `BI_TABLEROS` escrito en el `.env` de la API (la API aún no lo lee).
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
cd ~/digitexsa-erp && set -a && . ~/superset/superset.env && set +a
export SUPERSET_URL=http://127.0.0.1:8088 SUPERSET_ADMIN_USER=admin \
  BI_DB_HOST=localhost BI_DB_PORT=5432 BI_DB_NAME=erpdb
node infra/bi/configurar-superset.mjs
node infra/bi/tableros/construir-tableros.mjs --escribir-env apps/api/.env
```

**8. Activar en el ERP** (el único paso con efecto visible: reinicia la API 1-2 s).
Antes, el código con el interruptor `plataforma.tableros.acceder` tiene que estar desplegado: así, aunque
Superset ya esté funcionando, **el menú no aparece para nadie salvo ADMIN** hasta que se asigne desde `/roles`.
```bash
cd ~/digitexsa-erp/apps/api && set -a && . ~/superset/superset.env && set +a
cat >> .env <<EOF
SUPERSET_URL=http://127.0.0.1:8088
SUPERSET_PUBLIC_URL=http://192.168.2.13:8088
SUPERSET_SERVICE_USER=erp_servicio
SUPERSET_SERVICE_PASSWORD=$SUPERSET_SERVICE_PASSWORD
EOF
cd ~/digitexsa-erp && export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
bash scripts/deploy.sh          # mira que llegue a "Listo" ANTES de seguir
cd apps/api && npx prisma db seed
```

**9. Dar acceso.** En `/roles` asignar `plataforma.tableros.acceder` al rol que corresponda (además de
`costeo.dashboard.ver` / `ver_financiero`). Cada usuario debe cerrar sesión y volver a entrar.

### Cómo se revierte, paso por paso

| Paso | Retroceso |
|---|---|
| Ocultarlo YA (sin desinstalar) | Quitar `plataforma.tableros.acceder` desde `/roles`, o borrar las líneas `SUPERSET_*` del `.env` de la API y `pm2 restart digitexsa-api` |
| Superset | `pm2 delete superset && pm2 save`, borrar `~/superset`, y `sudo -u postgres psql -c "DROP DATABASE superset" -c "DROP ROLE superset"` |
| Rol de lectura | `infra/bi/quitar-rol-bi-lector.sql` (superusuario) |
| Migración `analitica` | `apps/api/prisma/migrations/20261025120000_analitica_vistas/rollback.sql` (`DROP SCHEMA analitica CASCADE`) y `DELETE FROM _prisma_migrations WHERE migration_name = '20261025120000_analitica_vistas'` |
| Código del ERP | `git revert` del commit; el módulo es aditivo y sin Superset configurado no se ve |
| Puerto | `sudo ufw delete allow from 192.168.2.0/24 to any port 8088 proto tcp` |

Looker Studio y el espejo a Google Sheets **no se tocaron** y siguen funcionando igual.

## Pendiente a propósito

- Acceso externo (dominio + HTTPS para ERP y Superset; con eso se activa `COOKIE_SECURE`).
- Costo real en quetzales por OP: necesita F5 y la captura de mano de obra. `v_costo_op` es costo
  **estándar de receta** y hoy solo 4 de ~1,358 productos tienen receta, así que casi todo el
  dinero sale en 0.
- Apagar `espeja_sheets` y retirar Looker Studio: después de comparar cifras en paralelo.
- Envío programado por correo (PDF/Excel): requiere Redis y Celery.
