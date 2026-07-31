import { defineConfig, Plugin } from 'vite'
import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'

function findFileInDir(dir: string, targetFileName: string, maxDepth: number = 6): string | null {
  if (!fs.existsSync(dir) || maxDepth < 0) return null;
  const targetLower = targetFileName.toLowerCase();

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        if (entry.name.toLowerCase() === targetLower) {
          return fullPath;
        }
      } else if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const found = findFileInDir(fullPath, targetFileName, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch (err) {
    // Ignora erros de permissão de pastas
  }

  return null;
}

function getVfpEditCommand(filePath: string, line: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const normalizedPath = path.normalize(filePath);

  if (ext === '.scx' || ext === '.sct') {
    return `MODIFY FORM "${normalizedPath}" NOWAIT`;
  } else if (ext === '.frx' || ext === '.frt') {
    return `MODIFY REPORT "${normalizedPath}" NOWAIT`;
  } else if (ext === '.vcx' || ext === '.vct') {
    return `MODIFY CLASS ? OF "${normalizedPath}" NOWAIT`;
  } else if (ext === '.prg') {
    const lineNum = parseInt(line, 10);
    return lineNum > 1 
      ? `MODIFY COMMAND "${normalizedPath}" RANGE ${lineNum} NOWAIT`
      : `MODIFY COMMAND "${normalizedPath}" NOWAIT`;
  }
  
  return `MODIFY COMMAND "${normalizedPath}" NOWAIT`;
}

function handleOpenFileRequest(req: any, res: any) {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const filePath = url.searchParams.get('file');
    const line = url.searchParams.get('line') || '1';
    const target = url.searchParams.get('target') || 'foxpro';

    res.setHeader('Content-Type', 'application/json');

    if (!filePath) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, error: 'Parâmetro file é obrigatório.' }));
      return;
    }

    let targetPath = path.normalize(filePath);
    let fileExists = fs.existsSync(targetPath);

    // Se o arquivo não existir diretamente, faz uma busca recursiva na pasta raiz (ex: C:\TestesVF)
    if (!fileExists) {
      const fileName = path.basename(targetPath);
      const driveMatch = targetPath.match(/^([a-zA-Z]:\\[^\\]+)/);
      const searchBaseDir = driveMatch ? driveMatch[1] : 'C:\\TestesVF';

      console.log(`[Open API] Buscando ${fileName} recursivamente em ${searchBaseDir}...`);
      const autoFound = findFileInDir(searchBaseDir, fileName);
      if (autoFound) {
        console.log(`[Open API] Arquivo localizado automaticamente em: ${autoFound}`);
        targetPath = autoFound;
        fileExists = true;
      }
    }

    if (!fileExists) {
      console.warn('[Open API] Arquivo não encontrado no disco:', targetPath);
      res.statusCode = 200; // Retorna 200 com JSON informando success: false para evitar erro 404 genérico no console
      res.end(JSON.stringify({ 
        success: false,
        error: `Arquivo não encontrado no disco:\n${targetPath}\n\nVerifique se a pasta raiz informada contém este arquivo.` 
      }));
      return;
    }

    const fileDir = path.dirname(targetPath);
    let cmd = '';

    if (target === 'vscode') {
      cmd = `code --goto "${targetPath}:${line}"`;
      exec(cmd, { cwd: fileDir }, (error) => {
        if (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: error.message }));
        } else {
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, method: cmd, resolvedPath: targetPath }));
        }
      });
    } else if (target === 'foxpro') {
      const vfpCmd = getVfpEditCommand(targetPath, line);
      
      const psScript = `
$fileDir = "${fileDir.replace(/"/g, '`"')}";
$targetPath = "${targetPath.replace(/"/g, '`"')}";
$vfpCmd = "${vfpCmd.replace(/"/g, '`"')}";
$opened = $false;

try {
    $vfp = [System.Runtime.InteropServices.Marshal]::GetActiveObject("VisualFoxPro.Application");
    if ($vfp) {
        $vfp.Visible = $true;
        $vfp.DoCmd("SET DEFAULT TO '$fileDir'");
        $vfp.DoCmd($vfpCmd);
        $opened = $true;
    }
} catch {}

if (-not $opened) {
    try {
        $vfp = New-Object -ComObject VisualFoxPro.Application;
        if ($vfp) {
            $vfp.Visible = $true;
            $vfp.DoCmd("SET DEFAULT TO '$fileDir'");
            $vfp.DoCmd($vfpCmd);
            $opened = $true;
        }
    } catch {}
}

if (-not $opened) {
    $tempPrg = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "vfp_open_file.prg");
    "SET DEFAULT TO '$fileDir'" + [Environment]::NewLine + $vfpCmd | Out-File -FilePath $tempPrg -Encoding ascii -Force;
    $vfpExe = "C:\\Program Files (x86)\\Microsoft Visual FoxPro 9\\vfp9.exe";
    if (Test-Path $vfpExe) {
        Start-Process -FilePath $vfpExe -ArgumentList "\`"$tempPrg\`"" -WorkingDirectory $fileDir;
    } else {
        Start-Process -FilePath "\`"$tempPrg\`"";
    }
}
`;

      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;

      exec(cmd, { cwd: fileDir }, (error) => {
        if (error) {
          console.error('[Open API] Erro ao executar PowerShell VFP:', error);
          
          // Fallback para comando básico de abertura
          const fallbackCmd = `start "" "${targetPath}"`;
          exec(fallbackCmd, { cwd: fileDir }, (fallbackErr) => {
            if (fallbackErr) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: fallbackErr.message }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, method: fallbackCmd, vfpCmd, resolvedPath: targetPath }));
            }
          });
        } else {
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, method: 'powershell_com', vfpCmd, resolvedPath: targetPath }));
        }
      });
    } else {
      cmd = `start "" "${targetPath}"`;
      exec(cmd, { cwd: fileDir }, (error) => {
        if (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: error.message }));
        } else {
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, method: cmd, resolvedPath: targetPath }));
        }
      });
    }
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err?.message || 'Erro interno' }));
  }
}

function localFileOpenerPlugin(): Plugin {
  return {
    name: 'local-file-opener',
    configureServer(server) {
      server.middlewares.use('/api/open-file', handleOpenFileRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/open-file', handleOpenFileRequest);
    }
  }
}

export default defineConfig({
  base: './', // Permite rodar o HTML diretamente do disco via file://
  plugins: [localFileOpenerPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
