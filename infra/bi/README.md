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
| `infra/bi/servidor/` | Servicio systemd y variables para el servidor (sin Docker) |

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

## Servidor de producción (sin Docker) — pendiente de ejecutar

Estado al 2026-10-25: **el servidor no respondió por SSH, así que nada de esto se hizo**. Producción
no tiene ningún cambio de este trabajo. Orden, y no se avanza si un paso falla:

0. **Punto de restauración** (como `erpadmin`): etiqueta `pre-bi-2026-10-25` en git (ya creada
   en local; `git push origin pre-bi-2026-10-25`), `pg_dump` completo de `erpdb` a `~/backups/`
   (verificar que restaura en una base desechable) y copia del `.env` y `ecosystem.config.js`.
   Medir antes: `free -m`, `df -h`, `nproc`, `python3 --version` (Superset 6.0 pide 3.10–3.12) —
   necesita ~1–2 GB de RAM libres.
1. **Migración** `analitica` (solo agrega objetos; la corre `digitexsa_erp`, dueño de `costeo` y
   `recetas`): desplegar el código y `prisma migrate deploy`.
2. **Rol de lectura** (superusuario): `sudo -u postgres psql -d erpdb -v clave="'...'" -f infra/bi/crear-rol-bi-lector.sql`.
3. **Base de Superset** (superusuario): `CREATE ROLE superset LOGIN PASSWORD '...'; CREATE DATABASE superset OWNER superset;`
4. **Superset**: ver `infra/bi/servidor/superset.service` (entorno virtual + gunicorn + systemd) y
   `infra/bi/servidor/superset.env.example`. `ERP_ORIGEN` = la dirección del ERP
   (`http://192.168.2.13`); `SUPERSET_PUBLIC_URL` = `http://192.168.2.13:8088`.
5. `superset db upgrade` y `superset init`; luego los tres scripts de arriba apuntando a
   `SUPERSET_URL=http://127.0.0.1:8088` y `BI_DB_HOST=localhost`, `BI_DB_PORT=5432`, `BI_DB_NAME=erpdb`.
6. **Seed** (permiso `costeo.dashboard.exportar`) y `pm2 restart digitexsa-api` con las variables
   `SUPERSET_*` y `BI_TABLEROS` en el `.env` de la API. Cada usuario debe **cerrar sesión y volver a
   entrar** para ver permisos nuevos.
7. Asignar `costeo.dashboard.ver` / `ver_financiero` / `exportar` a quien corresponda desde `/roles`.

`deploy.sh` migra antes de compilar; esta migración solo agrega, así que es seguro.

### Cómo se revierte, paso por paso

| Paso | Retroceso |
|---|---|
| Superset | `systemctl disable --now superset`, borrar `~/superset`, `DROP DATABASE superset; DROP ROLE superset;` |
| Rol de lectura | `infra/bi/quitar-rol-bi-lector.sql` (superusuario) |
| Migración | `apps/api/prisma/migrations/20261025120000_analitica_vistas/rollback.sql` (`DROP SCHEMA analitica CASCADE`) y `DELETE FROM _prisma_migrations WHERE migration_name = '20261025120000_analitica_vistas'` |
| Código del ERP | `git revert` del commit; el módulo es aditivo y sin Superset configurado no se ve |
| Todo el trabajo | `git checkout pre-bi-2026-10-25` + build + `pm2 restart`, y restaurar el `pg_dump` solo si se necesitara |

Looker Studio y el espejo a Google Sheets **no se tocaron** y siguen funcionando igual.

## Pendiente a propósito

- Acceso externo (dominio + HTTPS para ERP y Superset; con eso se activa `COOKIE_SECURE`).
- Costo real en quetzales por OP: necesita F5 y la captura de mano de obra. `v_costo_op` es costo
  **estándar de receta** y hoy solo 4 de ~1,358 productos tienen receta, así que casi todo el
  dinero sale en 0.
- Apagar `espeja_sheets` y retirar Looker Studio: después de comparar cifras en paralelo.
- Envío programado por correo (PDF/Excel): requiere Redis y Celery.
