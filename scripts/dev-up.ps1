<#
  Levanta el entorno local de Digitexsa ERP de una sola vez:
    1. Docker Desktop (si no esta corriendo)
    2. Postgres + Redis (infra/docker) y, salvo -SinSuperset, Superset local (infra/bi)
    3. La API (puerto 4000) y el frontend (puerto 5173), cada uno en su propia ventana
       para que veas los logs.
  Es idempotente: lo que ya esta corriendo se deja como esta.

  Uso (desde la raiz del repo o con doble clic en scripts\dev-up.cmd):
    scripts\dev-up.cmd                 levanta todo
    scripts\dev-up.cmd -SinSuperset    sin Superset (mas liviano)
    scripts\dev-up.cmd -Movil          ademas expone el frontend en la red local, para probar
                                       desde el celular (pide un permiso de firewall, una vez)
    scripts\dev-down.cmd               apaga API, frontend y contenedores
  (el texto va sin tildes a proposito: PowerShell 5.1 lee los .ps1 sin BOM como ANSI)
#>
param(
  [switch]$SinSuperset,
  [switch]$Movil,
  [switch]$Detener
)

$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeDev = Join-Path $raiz 'infra\docker\docker-compose.dev.yml'
$composeBi = Join-Path $raiz 'infra\bi\docker-compose.superset.yml'
$envBi = Join-Path $raiz 'infra\bi\.env.local'
$argsBi = @('compose', '-p', 'digitexsa-bi', '-f', $composeBi, '--env-file', $envBi)
$dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'

function Paso($t) { Write-Host "==> $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !!  $t" -ForegroundColor Yellow }

function Docker-Listo {
  & docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

function Puerto-Escuchando([int]$puerto) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $puerto -ErrorAction SilentlyContinue)
}

# Devuelve el codigo HTTP (0 si no responde). Un 401 llega como excepcion en PS 5.1.
function Codigo-Http([string]$url) {
  try {
    return [int](Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4).StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    return 0
  }
}

function Esperar([scriptblock]$condicion, [int]$segundos, [string]$que) {
  $limite = (Get-Date).AddSeconds($segundos)
  while ((Get-Date) -lt $limite) {
    if (& $condicion) { return $true }
    Start-Sleep -Seconds 3
  }
  Aviso "Tiempo agotado esperando: $que"
  return $false
}

# ---------------------------------------------------------------- apagar
if ($Detener) {
  Paso 'Cerrando API y frontend de este repo'
  $procs = Get-CimInstance Win32_Process |
    Where-Object {
      $_.ProcessId -ne $PID -and $_.CommandLine -and
      $_.CommandLine -like "*$raiz*" -and
      ($_.CommandLine -match 'nest(\.js)?\s+start|nest.*--watch|vite|dev-up-(api|web)')
    }
  foreach ($p in $procs) {
    & taskkill /T /F /PID $p.ProcessId *> $null
  }
  foreach ($puerto in 4000, 5173) {
    Get-NetTCPConnection -State Listen -LocalPort $puerto -ErrorAction SilentlyContinue |
      ForEach-Object { & taskkill /T /F /PID $_.OwningProcess *> $null }
  }
  Ok 'API y frontend cerrados'

  if (Docker-Listo) {
    Paso 'Deteniendo contenedores (los datos se conservan)'
    & docker compose -f $composeDev stop
    if ((Test-Path $composeBi) -and (Test-Path $envBi)) { & docker @argsBi stop }
    Ok 'Contenedores detenidos. Docker Desktop sigue abierto.'
  }
  return
}

# ---------------------------------------------------------------- docker
Paso 'Docker'
if (-not (Docker-Listo)) {
  if (-not (Test-Path $dockerDesktop)) { throw "No encuentro Docker Desktop en $dockerDesktop" }
  Aviso 'Docker no estaba corriendo; iniciando Docker Desktop...'
  Start-Process $dockerDesktop
  if (-not (Esperar { Docker-Listo } 240 'que Docker responda')) { throw 'Docker no arranco a tiempo.' }
}
Ok 'Docker listo'

Paso 'Postgres + Redis'
& docker compose -f $composeDev up -d
if ($LASTEXITCODE -ne 0) { throw 'docker compose fallo (Postgres/Redis).' }
if (-not (Esperar { Puerto-Escuchando 5433 } 90 'Postgres en el puerto 5433')) { throw 'Postgres no responde.' }
Ok 'Postgres en 5433, Redis en 6379'

if (-not $SinSuperset) {
  Paso 'Superset local (tableros)'
  if ((Test-Path $composeBi) -and (Test-Path $envBi)) {
    & docker @argsBi up -d
    if ($LASTEXITCODE -eq 0) { Ok 'Superset arrancando (tarda un minuto en estar sano)' }
    else { Aviso 'Superset no pudo arrancar; el ERP funciona igual sin el.' }
  }
}

# ---------------------------------------------------------------- API y web
# IP de la laptop en la red (la interfaz con salida a internet).
function Ip-Lan {
  $ruta = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric | Select-Object -First 1
  if (-not $ruta) { return $null }
  $ip = Get-NetIPAddress -InterfaceIndex $ruta.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return $ip.IPAddress
}

# True si el puerto solo escucha en loopback (localhost): el celular no lo alcanza.
function Solo-Loopback([int]$puerto) {
  $c = Get-NetTCPConnection -State Listen -LocalPort $puerto -ErrorAction SilentlyContinue
  if (-not $c) { return $false }
  return -not ($c | Where-Object { $_.LocalAddress -notin '::1', '127.0.0.1' })
}

function Abrir-Servicio([string]$nombre, [int]$puerto, [string]$carpeta, [string]$comando, [string]$marca) {
  if (Puerto-Escuchando $puerto) {
    Ok "$nombre ya estaba corriendo en el puerto $puerto"
    return
  }
  $dir = Join-Path $raiz $carpeta
  # La marca va dentro de la linea de comando para que dev-down la encuentre.
  $cmd = "`$null = '$marca'; `$host.UI.RawUI.WindowTitle = '$nombre'; Set-Location '$dir'; $comando"
  # Las comillas dobles externas son para que -Command reciba el texto como un solo argumento.
  Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', "`"$cmd`"" | Out-Null
  Ok "$nombre iniciado en una ventana nueva"
}

Paso 'API y frontend'
Abrir-Servicio 'Digitexsa API (nest watch)' 4000 'apps\api' 'npx nest start --watch' 'dev-up-api'
$comandoWeb = 'npx vite'
if ($Movil) {
  $comandoWeb = 'npx vite --host'
  # Un Vite que ya corria solo en localhost hay que reiniciarlo con --host.
  if (Solo-Loopback 5173) {
    Aviso 'El frontend corria solo en localhost; lo reinicio para exponerlo en la red...'
    Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue |
      ForEach-Object { & taskkill /T /F /PID $_.OwningProcess *> $null }
    Start-Sleep -Seconds 2
  }
}
Abrir-Servicio 'Digitexsa Web (vite)' 5173 'apps\web' $comandoWeb 'dev-up-web'

Paso 'Esperando a que respondan (la API tarda ~1 min en compilar)'
$apiOk = Esperar { (Codigo-Http 'http://localhost:4000/erp/api/auth/me') -eq 401 } 240 'la API'
$webOk = Esperar { (Codigo-Http 'http://localhost:5173/erp/') -eq 200 } 120 'el frontend'

Write-Host ''
if ($apiOk) { Ok 'API       http://localhost:4000/erp/api' } else { Aviso 'API no responde: mira su ventana.' }
if ($webOk) { Ok 'Frontend  http://localhost:5173/erp' } else { Aviso 'Frontend no responde: mira su ventana.' }
Aviso 'Recuerda: el .env local apunta a los libros reales de Google Sheets.'
if ($Movil) {
  $ip = Ip-Lan
  if ($ip) { Ok "Celular    http://$($ip):5173/erp   (el celular debe estar en el mismo Wi-Fi)" }
  $regla = Get-NetFirewallRule -DisplayName 'Digitexsa ERP dev (Vite 5173)' -ErrorAction SilentlyContinue
  if (-not $regla) {
    Aviso 'Falta el permiso de firewall; sin el, Windows bloquea al celular. Una sola vez,'
    Aviso 'en un PowerShell ABIERTO COMO ADMINISTRADOR, pega esto:'
    Write-Host '      New-NetFirewallRule -DisplayName "Digitexsa ERP dev (Vite 5173)" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -RemoteAddress LocalSubnet -Profile Any' -ForegroundColor White
  }
}
if ($apiOk -and $webOk) { Start-Process 'http://localhost:5173/erp' }
