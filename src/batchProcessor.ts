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
