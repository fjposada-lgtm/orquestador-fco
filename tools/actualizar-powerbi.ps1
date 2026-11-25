<#
    ORQUESTADOR PACO · Extracción de datos reales desde Power BI
    --------------------------------------------------------------------------
    Lee el modelo semántico corporativo y escribe data-real/powerbi.json, que
    js/powerbi.js carga en la Home.

    SOLO LECTURA. Usa únicamente:
      - inicio de sesión de Microsoft con código de dispositivo (tu cuenta)
      - executeQueries: consultas DAX de lectura sobre el modelo
    No actualiza, publica ni modifica nada en Power BI ni en sus fuentes.

    El token vive sólo en memoria durante la ejecución; no se guarda en disco.
    data-real/ está excluido de git: las cifras reales no se versionan.

    Uso:
        powershell -ExecutionPolicy Bypass -File tools\actualizar-powerbi.ps1
#>

param(
    [string]$GroupId   = 'deadc7a6-7fa8-4353-9b1f-5779f31f59d4',   # Área de trabajo: Gerencia
    [string]$DatasetId = '67b33b13-a85a-4a11-bb6d-9c6d00ddc75b',   # Reporte_de_Ventas_Corporativo_TX
    [int]$DesdeAnio    = 2024,
    [string]$TokenFile = ''                                        # opcional: JSON con access_token ya emitido
)

$ErrorActionPreference = 'Stop'
$inv      = [System.Globalization.CultureInfo]::InvariantCulture
$clientId = 'ea0616ba-638b-4df5-95b9-636659ae5121'                 # cliente público de Power BI PowerShell
$salida   = Join-Path (Split-Path $PSScriptRoot -Parent) 'data-real\powerbi.json'

# --- 1. Inicio de sesión ---------------------------------------------------
if ($TokenFile) {
    $token = (Get-Content $TokenFile -Raw | ConvertFrom-Json).access_token
} else {
    $dc = Invoke-RestMethod -Method Post -Uri 'https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode' `
            -Body @{ client_id = $clientId; scope = 'https://analysis.windows.net/powerbi/api/.default' }
    Write-Host ''
    Write-Host "  1. Abre  $($dc.verification_uri)" -ForegroundColor Cyan
    Write-Host "  2. Codigo $($dc.user_code)" -ForegroundColor Green
    Write-Host '  Esperando el inicio de sesion ...' -ForegroundColor DarkGray
    $token  = $null
    $limite = (Get-Date).AddSeconds([int]$dc.expires_in - 10)
    while (-not $token -and (Get-Date) -lt $limite) {
        Start-Sleep -Seconds ([Math]::Max(5, [int]$dc.interval))
        try {
            $t = Invoke-RestMethod -Method Post -Uri 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token' -Body @{
                    grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $clientId; device_code = $dc.device_code }
            $token = $t.access_token
        } catch {
            $m = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { $_.Exception.Message }
            if ($m -notmatch 'authorization_pending|slow_down') { throw "Inicio de sesión rechazado: $m" }
        }
    }
    if (-not $token) { throw 'El código expiró sin que se completara el inicio de sesión.' }
}

# --- 2. Consulta DAX de lectura ---------------------------------------------
function Consultar([string]$dax) {
    $body  = @{ queries = @(@{ query = $dax }); serializerSettings = @{ includeNulls = $true } } | ConvertTo-Json -Depth 5
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $uri   = "https://api.powerbi.com/v1.0/myorg/groups/$GroupId/datasets/$DatasetId/executeQueries"
    $w     = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $token" } `
                -ContentType 'application/json; charset=utf-8' -Body $bytes
    # Windows PowerShell 5.1 asume Latin-1 si la respuesta no declara charset.
    $txt = [System.Text.Encoding]::UTF8.GetString($w.RawContentStream.ToArray())
    ($txt | ConvertFrom-Json).results[0].tables[0].rows
}

$col = 'A' + [char]0xF1 + 'o'   # nombre de la columna de anio en Dias_Laborales

function Num($x) { if ($null -eq $x) { '0' } else { ([Math]::Round([double]$x)).ToString($inv) } }

# --- 3. Detalle diario por empresa -------------------------------------------
$empresas = New-Object System.Collections.Generic.List[string]
$filas    = New-Object System.Collections.Generic.List[string]
$corte    = ''
$ultima   = @{}                                                    # ultima fecha con venta por empresa
$anioFin  = (Get-Date).Year

foreach ($y in $DesdeAnio..$anioFin) {
    Write-Host "  Leyendo $y ..." -ForegroundColor DarkGray
    $rows = Consultar @"
EVALUATE
FILTER(
  SUMMARIZECOLUMNS(
    Dias_Laborales[Fecha], Empresas[Empresa],
    FILTER(ALL(Dias_Laborales[$col]), Dias_Laborales[$col] = $y),
    "v", [Despachado Total Corporativo],
    "c", [Costo Total Corporativo],
    "r", CALCULATE([Despachado Total Corporativo], Empresas_Relacionadas[Empresa Relacionada] = "Empresa Relacionada")
  ),
  NOT ISBLANK([v]) || NOT ISBLANK([c])
)
"@
    foreach ($r in $rows) {
        $f = ([datetime]$r.'Dias_Laborales[Fecha]').ToString('yyyy-MM-dd')
        $e = [string]$r.'Empresas[Empresa]'
        $i = $empresas.IndexOf($e)
        if ($i -lt 0) { $empresas.Add($e); $i = $empresas.Count - 1 }
        if ($f -gt $corte) { $corte = $f }
        if ([double]$r.'[v]' -gt 0 -and $f -gt [string]$ultima[$e]) { $ultima[$e] = $f }
        $filas.Add('["' + $f + '",' + $i + ',' + (Num $r.'[v]') + ',' + (Num $r.'[c]') + ',' + (Num $r.'[r]') + ']')
    }
}
if (-not $filas.Count) { throw 'El modelo no devolvió filas.' }

# --- 4. Proyección de cierre del mes de corte (medida del modelo) ------------
$cy = [int]$corte.Substring(0, 4); $cm = [int]$corte.Substring(5, 2)
$proy = Consultar @"
EVALUATE
SUMMARIZECOLUMNS(
  Empresas[Empresa],
  FILTER(ALL(Dias_Laborales[$col], Dias_Laborales[Mes]), Dias_Laborales[$col] = $cy && Dias_Laborales[Mes] = $cm),
  "p", [Proyeccion de Despacho Corporativo]
)
"@
$proyTxt = @($proy | Where-Object { $null -ne $_.'[p]' } | ForEach-Object {
    '"' + ([string]$_.'Empresas[Empresa]').Replace('"', '\"') + '":' + (Num $_.'[p]') }) -join ','

# --- 5. Linea Adhesivos: Planta Adhesivos dentro de Morteros TX ---------------
# La medida corporativa suma todas las sociedades; se acota a Morteros TX para
# que el filtro de planta (columna de sus guias) defina por completo el alcance.
$alcance = 'TREATAS({"Morteros TX"}, Empresas[Empresa]), TREATAS({"Planta Adhesivos"}, Guias_de_Despacho_SAP_GTX[Planta.1])'
Write-Host '  Leyendo linea Adhesivos ...' -ForegroundColor DarkGray

$adhFilas = New-Object System.Collections.Generic.List[string]
$adhCorte = ''
$rows = Consultar @"
EVALUATE
FILTER(
  SUMMARIZECOLUMNS(
    Dias_Laborales[Fecha],
    FILTER(ALL(Dias_Laborales[$col]), Dias_Laborales[$col] >= $DesdeAnio),
    $alcance,
    "v", [Despachado Total Corporativo],
    "c", [Costo Total Corporativo]
  ),
  NOT ISBLANK([v]) || NOT ISBLANK([c])
)
"@
foreach ($r in $rows) {
    $f = ([datetime]$r.'Dias_Laborales[Fecha]').ToString('yyyy-MM-dd')
    if ($f -gt $adhCorte) { $adhCorte = $f }
    $adhFilas.Add('["' + $f + '",' + (Num $r.'[v]') + ',' + (Num $r.'[c]') + ']')
}

# Detalle por familia: acumulado del anio al corte contra los mismos dias del anio anterior
$adhGrupos = New-Object System.Collections.Generic.List[string]
if ($adhCorte) {
    $ay = [int]$adhCorte.Substring(0, 4); $am = [int]$adhCorte.Substring(5, 2); $ad = [int]$adhCorte.Substring(8, 2)
    $adPrev = [Math]::Min($ad, [datetime]::DaysInMonth($ay - 1, $am))
    $act = "Dias_Laborales[Fecha] >= DATE($ay, 1, 1), Dias_Laborales[Fecha] <= DATE($ay, $am, $ad)"
    $ant = "Dias_Laborales[Fecha] >= DATE($($ay - 1), 1, 1), Dias_Laborales[Fecha] <= DATE($($ay - 1), $am, $adPrev)"
    $rows = Consultar @"
EVALUATE
SUMMARIZECOLUMNS(
  Guias_de_Despacho_SAP_GTX[Grupo de Articulo 2],
  $alcance,
  "v",  CALCULATE([Despachado Total Corporativo], $act),
  "c",  CALCULATE([Costo Total Corporativo], $act),
  "vp", CALCULATE([Despachado Total Corporativo], $ant),
  "cp", CALCULATE([Costo Total Corporativo], $ant)
)
"@
    foreach ($r in $rows) {
        if ($null -eq $r.'[v]' -and $null -eq $r.'[vp]') { continue }
        $n = ([string]$r.'Guias_de_Despacho_SAP_GTX[Grupo de Articulo 2]').Replace('\', '\\').Replace('"', '\"')
        $adhGrupos.Add('["' + $n + '",' + (Num $r.'[v]') + ',' + (Num $r.'[c]') + ',' + (Num $r.'[vp]') + ',' + (Num $r.'[cp]') + ']')
    }
}

# --- 6. Detalle por sociedad: desglose propio y principales clientes ----------
# Cada sociedad se compara hasta SU ultima fecha con venta, contra los mismos
# dias del anio anterior. El desglose usa la dimension propia de sus guias.
$dimension = @{
    'Hormigones TX'    = @('Planta',   'Guias_de_Despacho_Comand_HTX[Planta]')
    'Morteros TX'      = @('Planta',   'Guias_de_Despacho_SAP_GTX[Planta.1]')
    'Cementos TX'      = @('Segmento', 'Guias_de_Despacho_SAP_CTX[Segmento]')
    'Distribuidora TX' = @('Familia',  'Guias_de_Despacho_Softland_DCTX[Grupo de Articulo]')
    'Minera TX'        = @('Planta',   'Guias_de_Despacho_MR[Planta]')
}
function Txt($s) { ([string]$s).Replace('\', '\\').Replace('"', '\"') }

$socTxt = New-Object System.Collections.Generic.List[string]
foreach ($e in $empresas) {
    $u = [string]$ultima[$e]
    if (-not $u) { continue }
    Write-Host "  Leyendo detalle de $e ..." -ForegroundColor DarkGray
    $uy = [int]$u.Substring(0, 4); $um = [int]$u.Substring(5, 2); $ud = [int]$u.Substring(8, 2)
    $udPrev = [Math]::Min($ud, [datetime]::DaysInMonth($uy - 1, $um))
    $act = "Dias_Laborales[Fecha] >= DATE($uy, 1, 1), Dias_Laborales[Fecha] <= DATE($uy, $um, $ud)"
    $ant = "Dias_Laborales[Fecha] >= DATE($($uy - 1), 1, 1), Dias_Laborales[Fecha] <= DATE($($uy - 1), $um, $udPrev)"
    $soc = 'TREATAS({"' + $e + '"}, Empresas[Empresa])'
    $medidas = @"
  "v",  CALCULATE([Despachado Total Corporativo], $act),
  "c",  CALCULATE([Costo Total Corporativo], $act),
  "vp", CALCULATE([Despachado Total Corporativo], $ant),
  "cp", CALCULATE([Costo Total Corporativo], $ant)
"@

    $desTxt = ''; $dimNombre = ''
    if ($dimension.ContainsKey($e)) {
        $dimNombre = $dimension[$e][0]; $dimCol = $dimension[$e][1]
        $rows = Consultar "EVALUATE SUMMARIZECOLUMNS($dimCol, $soc,`n$medidas)"
        $desTxt = @($rows | Where-Object { $null -ne $_.'[v]' -or $null -ne $_.'[vp]' } | ForEach-Object {
            '["' + (Txt $_.$dimCol) + '",' + (Num $_.'[v]') + ',' + (Num $_.'[c]') + ',' + (Num $_.'[vp]') + ',' + (Num $_.'[cp]') + ']' }) -join ','
    }

    # El listado corporativo de clientes no filtra las guias de Cementos ni de
    # Distribuidora; para esas dos se usa la columna de cliente de su propia tabla.
    $cliCol = switch ($e) {
        'Cementos TX'      { 'Guias_de_Despacho_SAP_CTX[Nombre de cliente/proveedor]' }
        'Distribuidora TX' { 'Guias_de_Despacho_Softland_DCTX[Destino]' }
        default            { 'Listado_de_Clientes_Corporativo[Cliente]' }
    }
    $rows = Consultar "EVALUATE TOPN(15, SUMMARIZECOLUMNS($cliCol, $soc,`n$medidas), [v], DESC)"
    $cliTxt = @($rows | Where-Object { $null -ne $_.'[v]' } | Sort-Object { -[double]$_.'[v]' } | ForEach-Object {
        '["' + (Txt $_.$cliCol) + '",' + (Num $_.'[v]') + ',' + (Num $_.'[c]') + ',' + (Num $_.'[vp]') + ',' + (Num $_.'[cp]') + ']' }) -join ','

    $socTxt.Add('"' + (Txt $e) + '": { "corte": "' + $u + '", "dimension": "' + $dimNombre + '", "desglose": [' + $desTxt + '], "clientes": [' + $cliTxt + '] }')
}

# --- 7. Escritura -------------------------------------------------------------
$empTxt =@($empresas | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ','
$json = @"
{
  "meta": {
    "fuente": "Microsoft Power BI",
    "areaTrabajo": "Gerencia",
    "modelo": "Reporte_de_Ventas_Corporativo_TX",
    "extraido": "$((Get-Date).ToString('yyyy-MM-ddTHH:mm:ss'))",
    "corte": "$corte",
    "moneda": "CLP",
    "unidad": "pesos",
    "medidas": {
      "venta": "Despachado Total Corporativo",
      "costo": "Costo Total Corporativo",
      "relacionadas": "Despachado Total Corporativo, filtrado por Empresas_Relacionadas",
      "proyeccion": "Proyeccion de Despacho Corporativo"
    },
    "columnas": ["fecha", "empresa", "venta", "costo", "ventaRelacionadas"]
  },
  "empresas": [$empTxt],
  "proyeccionMes": { $proyTxt },
  "sociedades": {
    $($socTxt -join ",`n    ")
  },
  "adhesivos": {
    "definicion": "Morteros TX, despachos con Planta.1 = Planta Adhesivos",
    "corte": "$adhCorte",
    "columnasFilas": ["fecha", "venta", "costo"],
    "columnasGrupos": ["familia", "ventaAcum", "costoAcum", "ventaAcumAnterior", "costoAcumAnterior"],
    "grupos": [$($adhGrupos -join ',')],
    "filas": [$($adhFilas -join ',')]
  },
  "filas": [
$($filas -join ",`n")
  ]
}
"@

New-Item -ItemType Directory -Force (Split-Path $salida -Parent) | Out-Null
[System.IO.File]::WriteAllText($salida, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "  $($filas.Count) filas | $($empresas.Count) empresas | corte $corte" -ForegroundColor Green
Write-Host "  Escrito en $salida" -ForegroundColor Gray
Write-Host '  Recarga el Orquestador para ver los datos.' -ForegroundColor DarkGray
Write-Host ''
