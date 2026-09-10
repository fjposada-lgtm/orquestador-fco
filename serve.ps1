<#
    ORQUESTADOR PACO · Servidor local de desarrollo
    --------------------------------------------------------------------------
    Sirve el proyecto por HTTP para que el navegador pueda leer los archivos
    de data/ con fetch(). Al abrir index.html directamente desde el disco
    (file://) el navegador bloquea esas lecturas por seguridad.

    Uso:
        powershell -ExecutionPolicy Bypass -File serve.ps1
        powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9000

    Detener: Ctrl+C

    No requiere Node, Python ni permisos de administrador.
#>

param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.mjs'  = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.ico'  = 'image/x-icon'
    '.webp' = 'image/webp'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
    '.txt'  = 'text/plain; charset=utf-8'
    '.md'   = 'text/markdown; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  No se pudo abrir el puerto $Port." -ForegroundColor Red
    Write-Host "  Puede estar ocupado por otro proceso. Prueba con otro:" -ForegroundColor DarkGray
    Write-Host "      powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9000" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

$url = "http://localhost:$Port/"

Write-Host ""
Write-Host "  ORQUESTADOR PACO" -ForegroundColor Cyan
Write-Host "  Executive Command Center - servidor local" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Sirviendo : $root" -ForegroundColor Gray
Write-Host "  Disponible: $url" -ForegroundColor Green
Write-Host ""
Write-Host "  Ctrl+C para detener" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) { Start-Process $url | Out-Null }

try {
    while ($listener.IsListening) {

        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        # Ruta solicitada -> ruta en disco
        $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
        $path = Join-Path $root ($rel -replace '/', '\')

        # Un directorio sirve su index.html
        if ((Test-Path $path) -and (Get-Item $path).PSIsContainer) {
            $path = Join-Path $path 'index.html'
        }

        # Bloquea salidas fuera de la carpeta del proyecto
        $full = [System.IO.Path]::GetFullPath($path)
        $safe = $full.StartsWith([System.IO.Path]::GetFullPath($root), [StringComparison]::OrdinalIgnoreCase)

        if ($safe -and (Test-Path $full -PathType Leaf)) {
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $ext   = [System.IO.Path]::GetExtension($full).ToLower()

            $res.StatusCode  = 200
            $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            # Sin caché: los cambios en el código se ven al recargar
            $res.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate')
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)

            Write-Host ("  200  " + $req.Url.AbsolutePath) -ForegroundColor DarkGray
        }
        else {
            $body = [System.Text.Encoding]::UTF8.GetBytes(
                "<!doctype html><meta charset='utf-8'>" +
                "<body style='background:#07111F;color:#F4F7FA;font-family:Inter,Arial,sans-serif;padding:60px'>" +
                "<h1 style='font-weight:600'>404</h1>" +
                "<p style='color:#8FA3B8'>No existe <b>$($req.Url.AbsolutePath)</b> en el proyecto.</p>" +
                "<p><a href='/' style='color:#3B82F6'>Volver al Orquestador</a></p></body>")

            $res.StatusCode  = 404
            $res.ContentType = 'text/html; charset=utf-8'
            $res.ContentLength64 = $body.Length
            $res.OutputStream.Write($body, 0, $body.Length)

            Write-Host ("  404  " + $req.Url.AbsolutePath) -ForegroundColor DarkYellow
        }

        $res.OutputStream.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
    Write-Host ""
    Write-Host "  Servidor detenido." -ForegroundColor DarkGray
    Write-Host ""
}
