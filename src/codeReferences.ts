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

export async function handleCodeReferencesSearch(
    files: FileList,
    searchTerms: string[],
    matchExact: boolean,
    matchCase: boolean,
    matchSameMethod: boolean,
    onProgress: (msg: string) => void
): Promise<SearchResult[]> {
    const parser = new FoxProParser();
    const results: SearchResult[] = [];

    const terms = searchTerms.filter(t => t.trim().length > 0);
    if (terms.length === 0) return [];

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

                const blockMatch = line.match(/^<((?:Object\.[^\s]+\s+Method\.[^\s>]+)|(?:PRG[_\s]Method\s+[^\s>]+)|(?:PRG_TopLevel))>/i);
                if (blockMatch) {
                    currentMethodName = blockMatch[1].replace('Object.', '').replace('Method.', '').replace('PRG_Method ', '').replace('PRG Method ', '');
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
                const searchLine = matchCase ? line : line.toLowerCase();

                for (const term of terms) {
                    const searchTerm = matchCase ? term : term.toLowerCase();
                    let termMatched = false;

                    if (matchExact) {
                        const regex = new RegExp(`\\b${escapeRegExp(searchTerm)}\\b`);
                        if (regex.test(searchLine)) {
                            termMatched = true;
                        }
                    } else {
                        if (searchLine.includes(searchTerm)) {
                            termMatched = true;
                        }
                    }

                    if (termMatched) {
                        lineHasAnyTerm = true;
                        currentMethod.foundTerms.add(term);
                        fileFoundTerms.add(term);
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

export function renderTreeResults(results: SearchResult[], container: HTMLElement) {
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
        const fileLi = document.createElement('li');
        fileLi.className = 'bg-gray-50';

        const fileHeader = document.createElement('div');
        fileHeader.className = 'flex items-center px-4 py-2 cursor-pointer hover:bg-gray-100 font-bold text-gray-700 select-none';
        
        const fileIcon = document.createElement('span');
        fileIcon.innerHTML = `<svg class="w-4 h-4 mr-2 text-blue-600 transition-transform transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>`;
        
        fileHeader.appendChild(fileIcon);
        fileHeader.appendChild(document.createTextNode(filePath));
        
        const methodsUl = document.createElement('ul');
        methodsUl.className = 'pl-6 divide-y divide-gray-100';

        let fileTotalMatches = 0;

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
                matchLi.className = 'px-4 py-1 flex flex-col font-mono text-xs hover:bg-yellow-50 text-gray-600 border-l-2 border-transparent hover:border-yellow-400';
                
                const lineInfo = document.createElement('span');
                lineInfo.className = 'text-gray-400 text-[10px] mb-0.5';
                lineInfo.textContent = `Linha ${match.lineNumber}`;
                
                const codeSpan = document.createElement('span');
                codeSpan.className = 'whitespace-pre-wrap break-all';
                codeSpan.textContent = match.code;
                
                matchLi.appendChild(lineInfo);
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
        fileBadge.className = 'ml-auto bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded';
        fileBadge.textContent = fileTotalMatches.toString();
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
