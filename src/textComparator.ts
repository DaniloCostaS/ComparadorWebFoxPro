import * as diff from 'diff';
import { saveAs } from 'file-saver';

// Helper para escapar HTML em textos puros
function escapeHtml(unsafe: string) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;")
         .replace(/ /g, "&nbsp;");
}

export async function handleTextProcess(originalText: string, modifiedText: string, baseContent: string, fileName: string) {
    try {
        // Calcula as diferenças por linha
        const differences = diff.diffLines(originalText, modifiedText);
        
        let htmlRows = '';
        
        differences.forEach((part) => {
            // Cada 'part' pode conter múltiplas linhas, separadas por \n
            const lines = part.value.split('\n');
            // Remove a última string vazia gerada pelo split no \n final
            if (lines.length > 0 && lines[lines.length - 1] === '') {
                lines.pop();
            }

            lines.forEach((line) => {
                const escapedLine = escapeHtml(line) || '&nbsp;';
                
                if (part.added) {
                    htmlRows += `
<tr class="SectionMiddle">
<td class="TextItemSame Wrap">&nbsp;</td>
<td class="AlignCenter Wrap">&gt;</td>
<td class="TextItemSigAdd Wrap"><span class="TextSegSigDiff">${escapedLine}</span></td>
</tr>`;
                } else if (part.removed) {
                    htmlRows += `
<tr class="SectionMiddle">
<td class="TextItemSigDel Wrap"><span class="TextSegSigDiff">${escapedLine}</span></td>
<td class="AlignCenter Wrap">&lt;</td>
<td class="TextItemSame Wrap">&nbsp;</td>
</tr>`;
                } else {
                    htmlRows += `
<tr class="SectionMiddle">
<td class="TextItemSame Wrap">${escapedLine}</td>
<td class="AlignCenter Wrap">=</td>
<td class="TextItemSame Wrap">${escapedLine}</td>
</tr>`;
                }
            });
        });

        // Substitui no template
        let finalHtml = baseContent.replace('[[CONTEUDO_COMPARADO]]', htmlRows.trim());
        
        const finalName = fileName.trim() || 'COMPARACAO_TEXTO';
        finalHtml = finalHtml.replace(/\[\[NOME_FORM\]\]/g, finalName);
        
        // Download
        const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
        saveAs(blob, `${finalName}_INTERATIVO.HTML`);
        
    } catch (e: any) {
        alert(`Erro ao processar a comparação: ${e.message}`);
        console.error(e);
    }
}
