# Script PowerShell para registrar o protocolo foxpro:// no Windows para o usuário atual (HKCU)
# Não requer privilégios de Administrador.

$RegPath = "HKCU:\Software\Classes\foxpro"

try {
    New-Item -Path $RegPath -Force | Out-Null
    New-ItemProperty -Path $RegPath -Name "(default)" -Value "URL:FoxPro Protocol" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $RegPath -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

    $CommandPath = "$RegPath\shell\open\command"
    New-Item -Path $CommandPath -Force | Out-Null

    # Launcher PowerShell embutido para processar foxpro://open?file=C:\...\file.scx&line=10
    $launcherScript = @'
$raw = $args[0]
if (-not $raw) { exit }

$file = ""
$line = "1"

if ($raw -match "file=([^&]+)") {
    $file = [System.Uri]::UnescapeDataString($matches[1])
}
if ($raw -match "line=([^&]+)") {
    $line = $matches[1]
}

if (-not $file -or -not (Test-Path $file)) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show("Arquivo não encontrado no disco:`n$file", "FoxPro Protocol Launcher", 0, 48)
    } catch {}
    exit
}

$fileDir = [System.IO.Path]::GetDirectoryName($file)
$ext = [System.IO.Path]::GetExtension($file).ToLower()

$vfpCmd = switch ($ext) {
    ".scx" { "MODIFY FORM `"$file`" NOWAIT" }
    ".sct" { "MODIFY FORM `"$file`" NOWAIT" }
    ".frx" { "MODIFY REPORT `"$file`" NOWAIT" }
    ".frt" { "MODIFY REPORT `"$file`" NOWAIT" }
    ".vcx" { "MODIFY CLASS ? OF `"$file`" NOWAIT" }
    ".vct" { "MODIFY CLASS ? OF `"$file`" NOWAIT" }
    default { 
        if ([int]::TryParse($line, [ref]0) -and [int]$line -gt 1) {
            "MODIFY COMMAND `"$file`" RANGE $line NOWAIT"
        } else {
            "MODIFY COMMAND `"$file`" NOWAIT"
        }
    }
}

$opened = $false

# 1. Tenta COM Ativo (Janela do Visual FoxPro já aberta)
try {
    $vfp = [System.Runtime.InteropServices.Marshal]::GetActiveObject("VisualFoxPro.Application")
    if ($vfp) {
        $vfp.Visible = $true
        $vfp.DoCmd("SET DEFAULT TO '$fileDir'")
        $vfp.DoCmd($vfpCmd)
        $opened = $true
    }
} catch {}

# 2. Tenta Novo Objeto COM
if (-not $opened) {
    try {
        $vfp = New-Object -ComObject VisualFoxPro.Application
        if ($vfp) {
            $vfp.Visible = $true
            $vfp.DoCmd("SET DEFAULT TO '$fileDir'")
            $vfp.DoCmd($vfpCmd)
            $opened = $true
        }
    } catch {}
}

# 3. Fallback para vfp9.exe ou associação do SO
if (-not $opened) {
    $vfpExe = "C:\Program Files (x86)\Microsoft Visual FoxPro 9\vfp9.exe"
    if (Test-Path $vfpExe) {
        $tempPrg = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "vfp_open_file.prg")
        "SET DEFAULT TO '$fileDir'" + [Environment]::NewLine + $vfpCmd | Out-File -FilePath $tempPrg -Encoding ascii -Force
        Start-Process -FilePath $vfpExe -ArgumentList "`"$tempPrg`"" -WorkingDirectory $fileDir
    } else {
        Start-Process -FilePath "`"$file`""
    }
}

# Foca a janela do Visual FoxPro para trazer para a frente
try {
    Start-Sleep -Milliseconds 300
    $wshell = New-Object -ComObject WScript.Shell
    $vfpProc = Get-Process vfp9 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($vfpProc) {
        $wshell.AppActivate($vfpProc.Id)
    } else {
        $wshell.AppActivate("Visual FoxPro")
    }
} catch {}
'@

    # Grava o launcher script na pasta do usuário
    $userProfile = [Environment]::GetFolderPath("UserProfile")
    $launcherPath = Join-Path $userProfile ".foxpro_launcher.ps1"
    [System.IO.File]::WriteAllText($launcherPath, $launcherScript, [System.Text.Encoding]::UTF8)

    $cmdValue = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`" `"%1`""
    New-ItemProperty -Path $CommandPath -Name "(default)" -Value $cmdValue -PropertyType String -Force | Out-Null

    Write-Host "✅ Protocolo foxpro:// registrado com sucesso no Windows!" -ForegroundColor Green
    Write-Host "Launcher salvo em: $launcherPath" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Erro ao registrar protocolo foxpro://: $_" -ForegroundColor Red
}
