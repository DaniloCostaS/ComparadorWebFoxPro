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

export async function handleBatchProcess(baseContent: string, compareFiles: FileList) {
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
                // + 5 porque '</TR>' tem 5 caracteres
                let corpo = sourceHtml.substring(startIdx, endIdx + 5);
                
                // O FoxPro fazia STRCONV(lcCORPO, 9) que é conversão para UTF-8. 
                // No navegador, a API text() já tenta ler em UTF-8. Se o arquivo estiver em outro encoding
                // como ISO-8859-1, pode ser necessário passar o encoding no FileReader. 
                // Por enquanto assumimos UTF-8 (padrão web). Se der erro visual, ajustaremos.

                let finalHtml = baseContent.replace('[[CONTEUDO_COMPARADO]]', corpo.trim());
                // Substitui todas as ocorrências de [[NOME_FORM]]
                finalHtml = finalHtml.replace(/\[\[NOME_FORM\]\]/g, nomeArquivo.trim());
                
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

export type FoxProFileMap = Map<string, { scx?: File, sct?: File, frx?: File, frt?: File, prg?: File }>;

export async function handleFoxProBatchProcess(
    antesMap: FoxProFileMap, 
    depoisMap: FoxProFileMap, 
    baseContent: string,
    parser: any // We pass FoxProParser instance from main
) {
    const logsContainer = document.getElementById('foxpro-batch-logs');
    function logBatch(message: string, isError: boolean = false) {
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

    logBatch('Iniciando processamento em lote FoxPro...', false);
    
    try {
        const zip = new JSZip();
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        const { generateDiffHtml } = await import('./textComparator.ts');

        for (const [mapKey, depoisFiles] of depoisMap.entries()) {
            
            // Extract the original base name (without _SCX, _FRX, etc for the HTML name)
            const baseName = mapKey.substring(0, mapKey.lastIndexOf('_'));

            // Check what type of files we have in this mapKey
            const isScx = !!(depoisFiles.scx && depoisFiles.sct);
            const isFrx = !!(depoisFiles.frx && depoisFiles.frt);
            const isPrg = !!depoisFiles.prg;

            if (!isScx && !isFrx && !isPrg) {
                logBatch(`Erro: Arquivo incompleto no modificado para '${baseName}'. Ignorado.`, true);
                errorCount++;
                continue;
            }

            const antesFiles = antesMap.get(mapKey);

            if (!antesFiles) {
                // Arquivo Novo
                logBatch(`Aviso: Objeto '${baseName}' detectado como NOVO (não existe na origem). Ignorado.`, true);
                skippedCount++;
                continue;
            }

            const antesIsScx = !!(antesFiles.scx && antesFiles.sct);
            const antesIsFrx = !!(antesFiles.frx && antesFiles.frt);
            const antesIsPrg = !!antesFiles.prg;

            if (!antesIsScx && !antesIsFrx && !antesIsPrg) {
                logBatch(`Aviso: Objeto de origem '${baseName}' está incompleto. Ignorado.`, true);
                errorCount++;
                continue;
            }

            // Se chegou aqui, temos tudo para comparar!
            logBatch(`Processando '${baseName}'...`, false);
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
                     logBatch(`Erro: Tipos incompatíveis ou par incompleto para '${baseName}'.`, true);
                     errorCount++;
                     continue;
                }

                const finalHtml = generateDiffHtml(antesText, depoisText, baseContent, baseName);
                
                const finalFileName = `${baseName}_INTERATIVO.HTML`;
                zip.file(finalFileName, finalHtml);
                successCount++;
                logBatch(`Sucesso: '${baseName}' processado.`);
            } catch(e: any) {
                logBatch(`Erro ao parsear '${baseName}': ${e.message}`, true);
                errorCount++;
            }
        }

        if (successCount > 0) {
            logBatch('Gerando arquivo ZIP...', false);
            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, 'Comparacoes_Lote_FoxPro.zip');
            logBatch(`Concluído: ${successCount} salvos, ${skippedCount} pulados (novos), ${errorCount} erros.`);
        } else {
            logBatch('Nenhum arquivo válido pôde ser processado.', true);
        }

    } catch (e: any) {
        logBatch(`Erro geral ao processar lote FoxPro: ${e.message}`, true);
    }
}
