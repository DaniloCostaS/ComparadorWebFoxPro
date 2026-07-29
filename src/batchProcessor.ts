import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function log(message: string, isError: boolean = false) {
    const logsContainer = document.getElementById('batch-logs');
    if (logsContainer) {
        logsContainer.classList.remove('hidden');
        const el = document.createElement('div');
        el.textContent = message;
        if (isError) el.classList.add('text-red-600');
        logsContainer.appendChild(el);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
    console.log(message);
}

export async function handleBatchProcess(baseContent: string, compareFiles: FileList, customPrefix: string = '') {
    log('Iniciando processamento em lote...', false);
    
    try {
        const zip = new JSZip();
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < compareFiles.length; i++) {
            const file = compareFiles[i];
            const buffer = await file.arrayBuffer();
            const decoder = new TextDecoder('windows-1252');
            const sourceHtml = decoder.decode(buffer);
            let nomeArquivo = file.name;
            
            // Limpa o nome do arquivo, igual ao FoxPro
            nomeArquivo = nomeArquivo.replace(/_COMPLETO/i, '');
            nomeArquivo = nomeArquivo.replace(/_RESUMIDO/i, '');
            nomeArquivo = nomeArquivo.replace(/\.HTML/i, '');
            
            // Extrai as tags <TR>
            const upperSource = sourceHtml.toUpperCase();
            const startIdx = upperSource.indexOf('<TR');
            const endIdx = upperSource.lastIndexOf('</TR>');
            
            if (startIdx >= 0 && endIdx > startIdx) {
                let corpo = sourceHtml.substring(startIdx, endIdx + 5);

                let finalHtml = baseContent.replace('[[CONTEUDO_COMPARADO]]', () => corpo.trim());
                const prefixStr = customPrefix && customPrefix.trim() ? ` ${customPrefix.trim()}` : '';
                finalHtml = finalHtml.replace(/\[\[PREFIXO_DIFERENCAS\]\]/g, () => prefixStr);
                finalHtml = finalHtml.replace(/\[\[NOME_FORM\]\]/g, () => nomeArquivo.trim());
                
                const finalFileName = `${nomeArquivo.trim()}_INTERATIVO.HTML`;
                zip.file(finalFileName, finalHtml);
                successCount++;
                log(`Sucesso: ${file.name} -> ${finalFileName}`);
            } else {
                log(`Aviso: Tags <TR> ou </TR> não encontradas corretamente em ${file.name}`, true);
                errorCount++;
            }
        }

        if (successCount > 0) {
            log('Gerando arquivo ZIP...', false);
            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, 'Comparações_Geradas.zip');
            log(`Processamento concluído. ${successCount} salvos, ${errorCount} erros.`);
        } else {
            log('Nenhum arquivo pôde ser processado.', true);
        }

    } catch (e: any) {
        log(`Erro ao processar lote: ${e.message}`, true);
    }
}

export type BatchResultCategory = 'changed' | 'unchanged' | 'new' | 'missing' | 'error';

export interface BatchResultItem {
    name: string;
    mapKey: string;
    category: BatchResultCategory;
    message: string;
}

export type FoxProFileMap = Map<string, { scx?: File, sct?: File, frx?: File, frt?: File, prg?: File }>;

export async function handleFoxProBatchProcess(
    antesMap: FoxProFileMap, 
    depoisMap: FoxProFileMap, 
    baseContent: string,
    parser: any, // We pass FoxProParser instance from main
    checkMissing: boolean = false,
    customPrefix: string = ''
): Promise<BatchResultItem[]> {
    const logsContainer = document.getElementById('foxpro-batch-logs');
    function logBatch(message: string, isError: boolean = false, isWarning: boolean = false) {
        if (logsContainer) {
            logsContainer.classList.remove('hidden');
            const el = document.createElement('div');
            el.textContent = message;
            if (isError) el.classList.add('text-red-600');
            else if (isWarning) el.classList.add('text-yellow-600');
            logsContainer.appendChild(el);
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
        console.log(message);
    }

    logBatch('Iniciando processamento em lote FoxPro...', false);
    
    const results: BatchResultItem[] = [];

    try {
        const zip = new JSZip();
        let successCount = 0;
        let unchangedCount = 0;
        let newCount = 0;
        let missingCount = 0;
        let errorCount = 0;

        const { generateDiffHtml } = await import('./textComparator.ts');

        for (const [mapKey, depoisFiles] of depoisMap.entries()) {
            
            // Extract the original base name (without _SCX, _FRX, etc for the HTML name)
            const baseName = mapKey.substring(0, mapKey.lastIndexOf('_'));

            // Check what type of files we have in this mapKey
            const isScx = !!(depoisFiles.scx && depoisFiles.sct);
            const isFrx = !!(depoisFiles.frx && depoisFiles.frt);
            const isPrg = !!depoisFiles.prg;

            if (!isScx && !isFrx && !isPrg) {
                const msg = `Arquivo incompleto na pasta Modificada para '${baseName}'`;
                logBatch(`Erro: ${msg}. Ignorado.`, true);
                results.push({ name: baseName, mapKey, category: 'error', message: msg });
                errorCount++;
                continue;
            }

            const antesFiles = antesMap.get(mapKey);

            if (!antesFiles) {
                // Arquivo Novo (Apenas no Depois)
                const msg = `Objeto '${baseName}' detectado como NOVO (não existe na origem)`;
                logBatch(`Aviso: ${msg}. Ignorado.`, false, true);
                results.push({ name: baseName, mapKey, category: 'new', message: msg });
                newCount++;
                continue;
            }

            const antesIsScx = !!(antesFiles.scx && antesFiles.sct);
            const antesIsFrx = !!(antesFiles.frx && antesFiles.frt);
            const antesIsPrg = !!antesFiles.prg;

            if (!antesIsScx && !antesIsFrx && !antesIsPrg) {
                const msg = `Objeto de origem '${baseName}' está incompleto`;
                logBatch(`Aviso: ${msg}. Ignorado.`, true);
                results.push({ name: baseName, mapKey, category: 'error', message: msg });
                errorCount++;
                continue;
            }

            // Se chegou aqui, temos tudo para comparar!
            try {
                let antesText = '';
                let depoisText = '';

                if (isPrg && antesIsPrg) {
                    const dec = new TextDecoder('windows-1252');
                    
                    const bufAntes = await antesFiles.prg!.arrayBuffer();
                    antesText = parser.parsePrg(dec.decode(bufAntes));
                    
                    const bufDepois = await depoisFiles.prg!.arrayBuffer();
                    depoisText = parser.parsePrg(dec.decode(bufDepois));

                } else if (isScx && antesIsScx) {
                    const scxAntesBuf = await antesFiles.scx!.arrayBuffer();
                    const sctAntesBuf = await antesFiles.sct!.arrayBuffer();
                    antesText = parser.parse(scxAntesBuf, sctAntesBuf);

                    const scxDepoisBuf = await depoisFiles.scx!.arrayBuffer();
                    const sctDepoisBuf = await depoisFiles.sct!.arrayBuffer();
                    depoisText = parser.parse(scxDepoisBuf, sctDepoisBuf);

                } else if (isFrx && antesIsFrx) {
                    const frxAntesBuf = await antesFiles.frx!.arrayBuffer();
                    const frtAntesBuf = await antesFiles.frt!.arrayBuffer();
                    antesText = parser.parse(frxAntesBuf, frtAntesBuf);

                    const frxDepoisBuf = await depoisFiles.frx!.arrayBuffer();
                    const frtDepoisBuf = await depoisFiles.frt!.arrayBuffer();
                    depoisText = parser.parse(frxDepoisBuf, frtDepoisBuf);
                } else {
                     const msg = `Tipos incompatíveis ou par incompleto para '${baseName}'`;
                     logBatch(`Erro: ${msg}.`, true);
                     results.push({ name: baseName, mapKey, category: 'error', message: msg });
                     errorCount++;
                     continue;
                }

                // Verificar se o conteúdo é exatamente igual
                if (antesText.trim() === depoisText.trim()) {
                    const msg = `Conteúdo idêntico no antes e depois (sem alterações)`;
                    logBatch(`Ignorado: '${baseName}' existe na origem e no destino, mas está sem alterações. HTML não gerado.`, false, true);
                    results.push({ name: baseName, mapKey, category: 'unchanged', message: msg });
                    unchangedCount++;
                    continue;
                }

                const finalHtml = generateDiffHtml(antesText, depoisText, baseContent, baseName, customPrefix);
                
                const finalFileName = `${baseName}_INTERATIVO.HTML`;
                zip.file(finalFileName, finalHtml);
                successCount++;
                results.push({ name: baseName, mapKey, category: 'changed', message: 'Modificações detectadas - HTML gerado no ZIP' });
                logBatch(`Sucesso: '${baseName}' com alterações -> ${finalFileName}`);
            } catch(e: any) {
                const msg = `Erro ao parsear '${baseName}': ${e.message}`;
                logBatch(msg, true);
                results.push({ name: baseName, mapKey, category: 'error', message: msg });
                errorCount++;
            }
        }

        // Se o usuário solicitou verificar ausentes no Antes
        if (checkMissing) {
            for (const [mapKey] of antesMap.entries()) {
                if (!depoisMap.has(mapKey)) {
                    const baseName = mapKey.substring(0, mapKey.lastIndexOf('_'));
                    const msg = `Objeto '${baseName}' existe apenas na origem (ausente no modificado)`;
                    logBatch(`Aviso: ${msg}. Ignorado.`, false, true);
                    results.push({ name: baseName, mapKey, category: 'missing', message: msg });
                    missingCount++;
                }
            }
        }

        if (successCount > 0) {
            logBatch('Gerando arquivo ZIP...', false);
            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, 'Comparacoes_Lote_FoxPro.zip');
            logBatch(`Concluído: ${successCount} salvos no ZIP, ${unchangedCount} sem alteração, ${newCount} novos (depois)${checkMissing ? `, ${missingCount} ausentes (antes)` : ''}, ${errorCount} erros.`);
        } else {
            logBatch('Nenhum arquivo com alterações foi encontrado para gerar no ZIP.', true);
        }

    } catch (e: any) {
        logBatch(`Erro geral ao processar lote FoxPro: ${e.message}`, true);
    }

    return results;
}
