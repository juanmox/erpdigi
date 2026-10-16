# Despliegue de Subclientes a producción — procedimiento

Cubre tres commits que van **juntos y en orden**:

| | qué | commit |
|---|---|---|
| A | Catálogos de deporte y línea | `8b2d44b` |
| B | Subclientes (migración + código + script de fusión) | `d2d85c7` |
| C | `clientes.activo` + la FK deja de vaciar órdenes | `c9cfe70` |
| D | Seguridad del despliegue, y `UABBGTWSH1` marcado como Under Armour | — |

> **Ensayado antes de escribir esto.** El procedimiento completo —fusión,
> reversión, fusión de nuevo y las dos migraciones— se corrió contra una base
> desechable restaurada del respaldo previo. No es un plan en papel.

---

## ⚠️ Las migraciones que tocan `recetas` NO las aplica `deploy.sh`

Esto hizo fallar el despliegue real del 2026-10-15 y conviene leerlo antes de
planificar cualquier migración futura sobre `recetas`.

`recetas` es de **`erpadmin`**; `core` y `costeo` son de **`digitexsa_erp`**, el
rol con el que corre la app. **Ninguno de los dos es miembro del otro ni
superusuario**, así que `prisma migrate deploy` —que conecta como
`digitexsa_erp`— no puede:

- **crear** objetos en `recetas` (falla con `42501 permission denied for schema
  recetas`), ni
- **alterar** tablas de `recetas`: un `ALTER TABLE` exige ser DUEÑO, y un
  `GRANT CREATE` no alcanza para eso.

Qué hacer, que es lo que se hizo ese día:

```bash
# 1. Limpiar el intento fallido (verificando antes qué quedó aplicado).
npx prisma migrate resolve --rolled-back <nombre_migracion>

# 2. Aplicar cada migración con el dueño que corresponde.
#    Solo recetas  -> psql -d erpdb            (conecta como erpadmin por peer)
#    Solo costeo   -> psql "$URL"              (conecta como digitexsa_erp)
#    CRUZA schemas -> PARTIRLA y correr cada mitad con su dueño.

# 3. Avisarle a Prisma que ya están.
npx prisma migrate resolve --applied <nombre_migracion>
```

De las tres de este despliegue: `20261015120000_subclientes` es toda de
`recetas`; `20261015160000_subcliente_ua_sin_guion` también; y
`20261015140000_cliente_activo_y_guarda` **cruza** —agrega una columna en
`recetas.clientes` y cambia una FK en `costeo.orden_produccion`—, así que hubo
que partirla.

**Los permisos de las tablas nuevas salen solos**: el
`ALTER DEFAULT PRIVILEGES FOR ROLE erpadmin IN SCHEMA recetas` que se dejó en
agosto le da `arwd` a `digitexsa_erp` sobre todo lo que `erpadmin` cree ahí
(verificado sobre `recetas.subclientes`). Sin eso, la app levantaría y fallaría
en silencio con `42501` en cada consulta.

⚠️ **Un ensayo en una base local NO detecta nada de esto**: ahí un solo rol es
dueño de todo. Para que un ensayo cubra este riesgo tendría que reproducir
también los dueños, no solo los datos.

## Por qué el orden no se puede cambiar

`fusionar-under-armour-en-bsn.sql` va **antes** de `migrate deploy`, y la base
lo impone sola: la migración de subclientes **aborta** si el cliente `411`
todavía existe, porque el subcliente nace con ese mismo código y el UNIQUE no
deja que coexistan.

⚠️ **Y la fusión va antes de borrar nada.** `orden_produccion.id_cliente` era
`ON DELETE SET NULL`: borrar el cliente primero habría dejado **765 OP sin
cliente, en silencio**. El commit C justamente cambia esa FK a `RESTRICT` para
que no vuelva a ser posible — pero ese cambio llega *con* este despliegue, así
que durante el procedimiento la protección es la guarda del script.

---

## Qué van a ver los usuarios

**Las órdenes de Under Armour pasan a decir "BSN SPORTS"**, porque es a quien se
factura. Para que la marca no parezca perdida, la pantalla de Órdenes la muestra
igual, sacada de los productos: la ficha dice `BSN SPORTS` con `Under Armour`
debajo, y la tabla la pone como etiqueta en cada orden que la lleve.

**Hay una ventana de unos minutos** entre la fusión y el reinicio de la API en la
que producción corre con el código viejo y el cliente ya fusionado. En esa
ventana, un import con el código `411` falla con *"Cliente no reconocido"*. No se
pierde nada, pero conviene avisarle a Diseño y hacerlo fuera de hora pico.
Después del reinicio, `411` vuelve a funcionar como alias y el preview lo avisa.

---

## Procedimiento

### 1. Respaldo (obligatorio)

```bash
ssh erpadmin@192.168.2.13
cd /home/erpadmin/digitexsa-erp/apps/api
URL=$(grep -E "^DATABASE_URL=" .env | cut -d= -f2- | tr -d "\"'")
STAMP=$(date +%Y%m%d-%H%M%S)
pg_dump "$URL" --schema=recetas --schema=costeo --schema=core \
  > ~/backups/antes-subclientes-$STAMP.sql
ls -la ~/backups/antes-subclientes-$STAMP.sql   # que NO esté vacío
```

### 2. Traer los scripts

⚠️ Los scripts viven en el repo, así que el `git pull` va **antes** del
preflight. Es seguro: solo actualiza archivos en disco; PM2 sigue corriendo el
build anterior y nada cambia para los usuarios hasta el paso 4.

```bash
cd /home/erpadmin/digitexsa-erp && git pull --ff-only
```

(`deploy.sh` hace su propio pull; después de esto le queda como no-op.)

### 3. Verificación previa (no escribe nada)

```bash
cd apps/api
psql "$URL" -f scripts/preflight-subclientes.sql
```

Qué tiene que dar:

- **1** — el cliente `411` existe, con sus órdenes (en la última medición: **765**).
- **2** — `BSN SPORTS` existe (es el destino).
- **5** — los tres riesgos en **0**. Si alguno da 1, el despliegue ya se aplicó
  en parte: **parar** y revisar antes de seguir.

### 4. Fusión

```bash
psql "$URL" -v ON_ERROR_STOP=1 -f scripts/fusionar-under-armour-en-bsn.sql
```

Imprime cuántos registros repuntó por tabla. Todo o nada: si una guarda salta,
la transacción se revierte entera.

Verificar:

```bash
psql "$URL" -c "SELECT count(*) FROM recetas.clientes WHERE codigo='411';"          # 0
psql "$URL" -c "SELECT count(*) FROM costeo.orden_produccion WHERE id_cliente IS NULL;"
```

⚠️ El segundo número tiene que ser **el mismo que antes de empezar** (el
preflight lo imprime en su punto 4). Si subió, algo vació órdenes: **parar y
revertir**.

### 5. Despliegue

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
cd /home/erpadmin/digitexsa-erp
bash scripts/deploy.sh
```

Esperar a que llegue a **"Listo"**. Aplica las dos migraciones.

### 6. Verificación posterior

```bash
psql "$URL" -c "
SELECT (SELECT count(*) FROM recetas.subclientes) AS subclientes,
       (SELECT count(*) FROM recetas.productos WHERE id_subcliente IS NOT NULL) AS marcados,
       (SELECT count(*) FROM recetas.clientes WHERE activo) AS activos,
       (SELECT count(*) FROM recetas.productos) = (SELECT count(*) FROM recetas.v_producto_costo) AS invariante;"
```

`marcados` debe dar **44**: los 43 del prefijo `UA-`/`YUA-` más `UABBGTWSH1`,
que está escrito sin guion y por eso necesita su propia migración (confirmado
con el usuario que sí es Under Armour; se usa en 85 líneas de producción).

`invariante` debe ser `t`. Y la guarda nueva:

```bash
psql "$URL" -c "BEGIN; DELETE FROM recetas.clientes WHERE codigo='181'; ROLLBACK;"
```

Tiene que **fallar** con un error de llave foránea. Si pasa, la FK no quedó.

En el navegador: abrir una OP con prendas `UA-*` y confirmar que dice
`BSN SPORTS` con `Under Armour` debajo.

### 7. Catálogos de deporte y línea (aparte, opcional)

No es parte del despliegue; se puede correr después, cualquier día.

```bash
scp "ERP Recetas.xlsx" erpadmin@192.168.2.13:/tmp/recetas.xlsx
ssh erpadmin@192.168.2.13
cd /home/erpadmin/digitexsa-erp/apps/api
node scripts/catalogos-deporte-linea.mjs /tmp/recetas.xlsx --dry-run   # primero en seco
node scripts/catalogos-deporte-linea.mjs /tmp/recetas.xlsx
rm /tmp/recetas.xlsx
```

⚠️ El `--dry-run` revierte las filas pero **no el `setval`** de la secuencia: en
Postgres las secuencias no son transaccionales. Es inocuo (solo adelanta una
secuencia atrasada), pero por eso una segunda corrida en seco ya no lo reporta.

---

## Vuelta atrás

**Si la fusión ya corrió y el deploy todavía no:**

```bash
psql "$URL" -v ON_ERROR_STOP=1 -f scripts/revertir-fusion-under-armour.sql
```

Recrea el cliente `411` y devuelve cada registro, leyendo de `core.auditoria` la
lista exacta que la fusión guardó —por código, nunca por id—. **Probado en el
ensayo**: devolvió las 725 órdenes y los 4 productos, dejando el total de
órdenes intacto.

**Si el deploy ya corrió:** primero los `rollback.sql` de las dos migraciones,
en orden inverso, y después la reversión.

```bash
psql "$URL" -f prisma/migrations/20261015160000_subcliente_ua_sin_guion/rollback.sql
psql "$URL" -f prisma/migrations/20261015140000_cliente_activo_y_guarda/rollback.sql
psql "$URL" -f prisma/migrations/20261015120000_subclientes/rollback.sql
npx prisma migrate resolve --rolled-back 20261015160000_subcliente_ua_sin_guion
npx prisma migrate resolve --rolled-back 20261015140000_cliente_activo_y_guarda
npx prisma migrate resolve --rolled-back 20261015120000_subclientes
psql "$URL" -v ON_ERROR_STOP=1 -f scripts/revertir-fusion-under-armour.sql
```

⚠️ El rollback de subclientes **pierde la marca de subcliente de los productos**.
El backfill se rehace por el prefijo `UA-`/`YUA-`, pero cualquier marca puesta a
mano desde la pantalla de producto no se recupera.

**Si nada de eso alcanza:** restaurar el respaldo del paso 1. Es el único camino
que deshace absolutamente todo, y el motivo por el que ese paso no es opcional.

---

## Diferencias de producción contra local (medidas el 2026-10-15)

Los conteos **no** van a coincidir con los de local, y está bien:

| | local | producción |
|---|---|---|
| OP en UNDER ARMOUR | 725 | **765** |
| Órdenes de producción | 6,675 | **7,576** |
| Productos | 1,301 | **1,302** |
| Líneas de producto | 3 → 18 | **10** |
| Productos con deporte | 1,300 | **4** |

Los scripts reconcilian sin pisar: el de catálogos solo agrega lo que falta, y
la fusión resuelve todo por código y nombre, nunca por id (los ids difieren
entre ambientes — ya pasó con las tallas, donde `2XS-XS` es 440 acá y 298 allá).
