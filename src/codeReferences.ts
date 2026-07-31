import { FoxProParser } from './foxproParser.ts';

export interface SearchResult {
    filePath: string;
    methodName: string;
    lineNumber: number;
    code: string;
}

function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchRegex(term: string, matchExact: boolean, matchCase: boolean, ignoreSpaces: boolean): RegExp {
    const flags = matchCase ? '' : 'i';
    
    if (!ignoreSpaces) {
        const escaped = escapeRegExp(term);
        const pattern = matchExact ? `\\b${escaped}\\b` : escaped;
        return new RegExp(pattern, flags);
    }

    // Se ignoreSpaces for verdadeiro: permite \s* entre tokens, palavras e símbolos
    const tokens = term.trim().split(/(\s+|[^a-zA-Z0-9_])/).filter(t => t.length > 0);
    const patternParts = tokens.map(t => {
        if (/^\s+$/.test(t)) return '\\s*';
        if (/^[^a-zA-Z0-9_]$/.test(t)) return '\\s*' + escapeRegExp(t) + '\\s*';
        return escapeRegExp(t);
    });

    let pattern = patternParts.join('').replace(/(\\s\*)+/g, '\\s*');
    if (matchExact) {
        pattern = `\\b${pattern}\\b`;
    }
    return new RegExp(pattern, flags);
}

export async function handleCodeReferencesSearch(
    files: FileList,
    searchTerms: string[],
    matchExact: boolean,
    matchCase: boolean,
    matchSameMethod: boolean,
    ignoreSpaces: boolean,
    onProgress: (msg: string) => void
): Promise<SearchResult[]> {
    const parser = new FoxProParser();
    const results: SearchResult[] = [];

    const terms = searchTerms.filter(t => t.trim().length > 0);
    if (terms.length === 0) return [];

    const termMatchers = terms.map(term => ({
        term,
        regex: buildSearchRegex(term, matchExact, matchCase, ignoreSpaces),
        termClean: matchCase ? term.replace(/\s+/g, '') : term.toLowerCase().replace(/\s+/g, '')
    }));

    const fileGroups = new Map<string, { scx?: File, sct?: File, vcx?: File, vct?: File, frx?: File, frt?: File, prg?: File, folderPath: string }>();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();
        const basePath = file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf('.')).toLowerCase();
        
        if (!fileGroups.has(basePath)) {
            fileGroups.set(basePath, { folderPath: file.webkitRelativePath });
        }
        const group = fileGroups.get(basePath)!;

        if (ext === 'scx') group.scx = file;
        if (ext === 'sct') group.sct = file;
        if (ext === 'vcx') group.vcx = file;
        if (ext === 'vct') group.vct = file;
        if (ext === 'frx') group.frx = file;
        if (ext === 'frt') group.frt = file;
        if (ext === 'prg') group.prg = file;
    }

    const totalGroups = fileGroups.size;
    let processed = 0;

    for (const [basePath, group] of fileGroups.entries()) {
        processed++;
        onProgress(`Processando ${processed} de ${totalGroups}...`);

        try {
            let parsedText = '';
            let filePath = '';

            if (group.prg) {
                filePath = group.prg.webkitRelativePath;
                const prgBuf = await group.prg.arrayBuffer();
                const decoder = new TextDecoder('windows-1252');
                const text = decoder.decode(prgBuf);
                parsedText = parser.parsePrg(text);
            } else if (group.scx && group.sct) {
                filePath = group.scx.webkitRelativePath;
                const scxBuf = await group.scx.arrayBuffer();
                const sctBuf = await group.sct.arrayBuffer();
                parsedText = parser.parse(scxBuf, sctBuf);
            } else if (group.vcx && group.vct) {
                filePath = group.vcx.webkitRelativePath;
                const vcxBuf = await group.vcx.arrayBuffer();
                const vctBuf = await group.vct.arrayBuffer();
                parsedText = parser.parse(vcxBuf, vctBuf);
            } else if (group.frx && group.frt) {
                filePath = group.frx.webkitRelativePath;
                const frxBuf = await group.frx.arrayBuffer();
                const frtBuf = await group.frt.arrayBuffer();
                parsedText = parser.parse(frxBuf, frtBuf);
            } else {
                continue;
            }

            const lines = parsedText.split(/\r?\n/);
            
            interface MethodMatch {
                methodName: string;
                lines: { lineNumber: number, code: string }[];
                foundTerms: Set<string>;
            }

            let currentMethodName = '_TOP_LEVEL';
            let methodLineNum = 0;
            
            const methodsInFile: MethodMatch[] = [];
            let currentMethod: MethodMatch = { methodName: currentMethodName, lines: [], foundTerms: new Set() };
            methodsInFile.push(currentMethod);
            
            const fileFoundTerms = new Set<string>();

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                const blockMatch = line.match(/^<((?:Object\.[^\s]+\s+(?:Method\.[^\s>]+|Properties|EXPR|TAG2?|PICTURE))|(?:PRG[_\s]Method\s+[^\s>]+)|(?:PRG_TopLevel))>/i);
                if (blockMatch) {
                    currentMethodName = blockMatch[1].replace('Object.', '').replace(/\s+Method\./i, ' - ').replace(/\s+(Properties|EXPR|TAG2?|PICTURE)$/i, ' - $1').replace('PRG_Method ', '').replace('PRG Method ', '');
                    methodLineNum = 0;
                    currentMethod = { methodName: currentMethodName, lines: [], foundTerms: new Set() };
                    methodsInFile.push(currentMethod);
                    continue;
                }

                if (line.match(/^<\/((?:Object|PRG).+)>/i)) {
                    continue;
                }

                methodLineNum++;
                if (trimmed === '') continue;

                let lineHasAnyTerm = false;

                for (const matcher of termMatchers) {
                    // Reinicia o índice de busca da regex global/case
                    matcher.regex.lastIndex = 0;
                    let termMatched = matcher.regex.test(line);

                    if (!termMatched && ignoreSpaces && !matchExact) {
                        const searchLineClean = matchCase ? line.replace(/\s+/g, '') : line.toLowerCase().replace(/\s+/g, '');
                        if (searchLineClean.includes(matcher.termClean)) {
                            termMatched = true;
                        }
                    }

                    if (termMatched) {
                        lineHasAnyTerm = true;
                        currentMethod.foundTerms.add(matcher.term);
                        fileFoundTerms.add(matcher.term);
                    }
                }

                if (lineHasAnyTerm) {
                    currentMethod.lines.push({
                        lineNumber: methodLineNum,
                        code: line.trim()
                    });
                }
            }

            // Post-process the file to see if it's a hit based on constraints
            if (matchSameMethod) {
                // Only methods that contain ALL terms are hits
                for (const method of methodsInFile) {
                    if (method.foundTerms.size === terms.length) {
                        for (const matchLine of method.lines) {
                            results.push({
                                filePath,
                                methodName: method.methodName,
                                lineNumber: matchLine.lineNumber,
                                code: matchLine.code
                            });
                        }
                    }
                }
            } else {
                // If the entire file contains ALL terms, ALL matched lines in the file are hits
                if (fileFoundTerms.size === terms.length) {
                    for (const method of methodsInFile) {
                        for (const matchLine of method.lines) {
                            results.push({
                                filePath,
                                methodName: method.methodName,
                                lineNumber: matchLine.lineNumber,
                                code: matchLine.code
                            });
                        }
                    }
                }
            }

        } catch (err) {
            console.error(`Erro ao processar ${basePath}:`, err);
        }
    }

    return results;
}

export async function openLocalFile(fullPath: string, line: number = 1, target: 'foxpro' | 'vscode' | 'system' = 'foxpro') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
        try {
            const res = await fetch(`/api/open-file?file=${encodeURIComponent(fullPath)}&line=${line}&target=${target}`);
            let data: any = null;
            try { data = await res.json(); } catch {}

            if (res.ok && data?.success) return true;
            if (data && data.success === false && data.error) {
                alert(`⚠️ Erro ao abrir arquivo:\n${data.error}`);
                return false;
            }
        } catch (e) {
            // Backend Vite local indisponível
        }
    } else {
        // Se a aplicação estiver hospedada na nuvem (ex: Render.com), tenta se há um dev server Vite local ativo na porta 5173
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 600);
            const res = await fetch(`http://localhost:5173/api/open-file?file=${encodeURIComponent(fullPath)}&line=${line}&target=${target}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            let data: any = null;
            try { data = await res.json(); } catch {}
            if (res.ok && data?.success) return true;
        } catch (e) {
            // Servidor Vite local não está escutando na porta 5173
        }
    }

    // Fallback nativo via esquema de protocolo do SO (foxpro:// ou vscode://)
    if (target === 'vscode') {
        try {
            window.location.href = `vscode://file/${fullPath.replace(/\\/g, '/')}:${line}`;
            return true;
        } catch {}
    } else if (target === 'foxpro') {
        try {
            window.location.href = `foxpro://open?file=${encodeURIComponent(fullPath)}&line=${line}`;
            return true;
        } catch {}
    }

    // Se falhar tudo, copia o comando FoxPro para a área de transferência
    const vfpCmd = getFoxProCommand(fullPath, line);
    try {
        await navigator.clipboard.writeText(vfpCmd);
        alert(`ℹ️ O comando FoxPro foi copiado para a área de transferência:\n\n${vfpCmd}`);
    } catch {
        alert(`ℹ️ Comando FoxPro:\n${vfpCmd}`);
    }

    return false;
}

export function combinePaths(rootPath: string, relativePath: string): string {
    const cleanRoot = rootPath.trim().replace(/[\/\\]+$/, '');
    if (!cleanRoot) return relativePath.replace(/\//g, '\\');

    const rootParts = cleanRoot.split(/[\/\\]/).filter(Boolean);
    const relParts = relativePath.split(/[\/\\]/).filter(Boolean);

    const lastRootFolder = rootParts[rootParts.length - 1]?.toLowerCase();
    const firstRelFolder = relParts[0]?.toLowerCase();

    if (lastRootFolder && firstRelFolder && lastRootFolder === firstRelFolder) {
        relParts.shift();
    }

    return `${cleanRoot}\\${relParts.join('\\')}`;
}

export function getFoxProCommand(fullPath: string, line?: number): string {
    const ext = fullPath.split('.').pop()?.toLowerCase() || '';
    if (ext === 'scx' || ext === 'sct') {
        return `MODIFY FORM "${fullPath}"`;
    } else if (ext === 'vcx' || ext === 'vct') {
        return `MODIFY CLASS ? OF "${fullPath}"`;
    } else if (ext === 'frx' || ext === 'frt') {
        return `MODIFY REPORT "${fullPath}"`;
    } else if (ext === 'prg') {
        return (line && line > 1) ? `MODIFY COMMAND "${fullPath}" RANGE ${line}` : `MODIFY COMMAND "${fullPath}"`;
    }
    return `MODIFY COMMAND "${fullPath}"`;
}

function showCopyFeedback(btn: HTMLElement, originalText: string) {
    btn.textContent = '✓ Copiado!';
    btn.classList.add('bg-green-100', 'text-green-800');
    setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('bg-green-100', 'text-green-800');
    }, 1500);
}

export function renderTreeResults(results: SearchResult[], container: HTMLElement, rootPath: string = '') {
    container.innerHTML = '';
    
    if (results.length === 0) {
        container.innerHTML = '<div class="p-4 text-gray-500 text-center">Nenhum resultado encontrado.</div>';
        return;
    }

    // Group by file -> method
    const tree = new Map<string, Map<string, SearchResult[]>>();
    
    for (const res of results) {
        if (!tree.has(res.filePath)) {
            tree.set(res.filePath, new Map());
        }
        const fileMethods = tree.get(res.filePath)!;
        if (!fileMethods.has(res.methodName)) {
            fileMethods.set(res.methodName, []);
        }
        fileMethods.get(res.methodName)!.push(res);
    }

    // Render HTML
    const ul = document.createElement('ul');
    ul.className = 'divide-y divide-gray-200';

    for (const [filePath, methods] of Array.from(tree.entries()).sort()) {
        const fullPath = combinePaths(rootPath, filePath);

        const fileLi = document.createElement('li');
        fileLi.className = 'bg-gray-50';

        const fileHeader = document.createElement('div');
        fileHeader.className = 'flex items-center justify-between px-4 py-2 hover:bg-gray-100 font-bold text-gray-700 select-none cursor-pointer';
        
        const fileHeaderLeft = document.createElement('div');
        fileHeaderLeft.className = 'flex items-center flex-1 overflow-hidden mr-2';

        const fileIcon = document.createElement('span');
        fileIcon.innerHTML = `<svg class="w-4 h-4 mr-2 text-blue-600 transition-transform transform rotate-90 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>`;
        
        const fileNameSpan = document.createElement('span');
        fileNameSpan.className = 'truncate';
        fileNameSpan.textContent = filePath;
        fileNameSpan.title = fullPath;

        fileHeaderLeft.appendChild(fileIcon);
        fileHeaderLeft.appendChild(fileNameSpan);

        // Botões de ação no cabeçalho do arquivo
        const fileActions = document.createElement('div');
        fileActions.className = 'flex items-center space-x-1 flex-shrink-0';
        fileActions.addEventListener('click', (e) => e.stopPropagation());

        // Botão FoxPro
        const btnFox = document.createElement('button');
        btnFox.type = 'button';
        btnFox.className = 'px-2 py-0.5 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded font-semibold transition-colors flex items-center gap-1 cursor-pointer';
        btnFox.title = `Abrir no Visual FoxPro: ${fullPath}`;
        btnFox.innerHTML = `🦊 FoxPro`;
        btnFox.addEventListener('click', () => openLocalFile(fullPath, 1, 'foxpro'));

        // Botão VS Code
        const btnCode = document.createElement('button');
        btnCode.type = 'button';
        btnCode.className = 'px-2 py-0.5 text-xs bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 rounded font-semibold transition-colors flex items-center gap-1 cursor-pointer';
        btnCode.title = `Abrir no VS Code: ${fullPath}`;
        btnCode.innerHTML = `📝 VS Code`;
        btnCode.addEventListener('click', () => openLocalFile(fullPath, 1, 'vscode'));

        // Copiar Comando VFP
        const btnCopyCmd = document.createElement('button');
        btnCopyCmd.type = 'button';
        btnCopyCmd.className = 'px-2 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-semibold transition-colors cursor-pointer';
        btnCopyCmd.title = 'Copiar Comando FoxPro (MODIFY FORM/COMMAND)';
        btnCopyCmd.textContent = '💬 Cmd VFP';
        btnCopyCmd.addEventListener('click', () => {
            const cmd = getFoxProCommand(fullPath);
            navigator.clipboard.writeText(cmd);
            showCopyFeedback(btnCopyCmd, '💬 Cmd VFP');
        });

        // Copiar Caminho
        const btnCopyPath = document.createElement('button');
        btnCopyPath.type = 'button';
        btnCopyPath.className = 'px-2 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-semibold transition-colors cursor-pointer';
        btnCopyPath.title = 'Copiar Caminho Absoluto do Arquivo';
        btnCopyPath.textContent = '📋 Caminho';
        btnCopyPath.addEventListener('click', () => {
            navigator.clipboard.writeText(fullPath);
            showCopyFeedback(btnCopyPath, '📋 Caminho');
        });

        let fileTotalMatches = 0;

        fileActions.appendChild(btnFox);
        fileActions.appendChild(btnCode);
        fileActions.appendChild(btnCopyCmd);
        fileActions.appendChild(btnCopyPath);

        const methodsUl = document.createElement('ul');
        methodsUl.className = 'pl-6 divide-y divide-gray-100';

        for (const [methodName, matches] of Array.from(methods.entries()).sort()) {
            fileTotalMatches += matches.length;
            
            const methodLi = document.createElement('li');
            
            const methodHeader = document.createElement('div');
            methodHeader.className = 'flex items-center px-4 py-2 cursor-pointer hover:bg-gray-100 font-semibold text-gray-600 select-none bg-white';
            
            const methodIcon = document.createElement('span');
            methodIcon.innerHTML = `<svg class="w-4 h-4 mr-2 text-purple-600 transition-transform transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>`;
            
            methodHeader.appendChild(methodIcon);
            methodHeader.appendChild(document.createTextNode(`${methodName} (${matches.length})`));
            
            const matchesUl = document.createElement('ul');
            matchesUl.className = 'pl-8 py-1 bg-white';
            
            for (const match of matches) {
                const matchLi = document.createElement('li');
                matchLi.className = 'px-4 py-2 flex flex-col font-mono text-xs hover:bg-yellow-50 text-gray-600 border-l-2 border-transparent hover:border-yellow-400 group';
                
                const lineRow = document.createElement('div');
                lineRow.className = 'flex items-center justify-between mb-1';

                const lineInfo = document.createElement('span');
                lineInfo.className = 'text-gray-400 text-[11px] font-bold';
                lineInfo.textContent = `Linha ${match.lineNumber}`;

                // Action buttons inline for the line
                const lineActions = document.createElement('div');
                lineActions.className = 'flex items-center space-x-1 opacity-90 group-hover:opacity-100 transition-opacity';

                const btnLineFox = document.createElement('button');
                btnLineFox.type = 'button';
                btnLineFox.className = 'px-1.5 py-0.5 text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded font-semibold cursor-pointer';
                btnLineFox.title = `Abrir no FoxPro na Linha ${match.lineNumber}`;
                btnLineFox.textContent = '🦊 FoxPro';
                btnLineFox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openLocalFile(fullPath, match.lineNumber, 'foxpro');
                });

                const btnLineCode = document.createElement('button');
                btnLineCode.type = 'button';
                btnLineCode.className = 'px-1.5 py-0.5 text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 rounded font-semibold cursor-pointer';
                btnLineCode.title = `Abrir no VS Code na Linha ${match.lineNumber}`;
                btnLineCode.textContent = '📝 VS Code';
                btnLineCode.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openLocalFile(fullPath, match.lineNumber, 'vscode');
                });

                const btnLineCmd = document.createElement('button');
                btnLineCmd.type = 'button';
                btnLineCmd.className = 'px-1.5 py-0.5 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-semibold cursor-pointer';
                btnLineCmd.title = 'Copiar Comando FoxPro da Linha';
                btnLineCmd.textContent = '💬 Cmd VFP';
                btnLineCmd.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cmd = getFoxProCommand(fullPath, match.lineNumber);
                    navigator.clipboard.writeText(cmd);
                    showCopyFeedback(btnLineCmd, '💬 Cmd VFP');
                });

                lineActions.appendChild(btnLineFox);
                lineActions.appendChild(btnLineCode);
                lineActions.appendChild(btnLineCmd);

                lineRow.appendChild(lineInfo);
                lineRow.appendChild(lineActions);

                const codeSpan = document.createElement('span');
                codeSpan.className = 'whitespace-pre-wrap break-all bg-amber-50/50 p-1.5 rounded border border-amber-100 text-gray-800';
                codeSpan.textContent = match.code;
                
                matchLi.appendChild(lineRow);
                matchLi.appendChild(codeSpan);
                matchesUl.appendChild(matchLi);
            }
            
            methodHeader.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = matchesUl.classList.toggle('hidden');
                methodIcon.querySelector('svg')!.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(90deg)';
            });

            methodLi.appendChild(methodHeader);
            methodLi.appendChild(matchesUl);
            methodsUl.appendChild(methodLi);
        }

        const fileBadge = document.createElement('span');
        fileBadge.className = 'ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded';
        fileBadge.textContent = fileTotalMatches.toString();

        fileHeader.appendChild(fileHeaderLeft);
        fileHeader.appendChild(fileActions);
        fileHeader.appendChild(fileBadge);

        fileHeader.addEventListener('click', () => {
            const isHidden = methodsUl.classList.toggle('hidden');
            fileIcon.querySelector('svg')!.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(90deg)';
        });

        fileLi.appendChild(fileHeader);
        fileLi.appendChild(methodsUl);
        ul.appendChild(fileLi);
    }

    container.appendChild(ul);
}
