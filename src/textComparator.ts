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

export function generateDiffHtml(originalText: string, modifiedText: string, baseContent: string, fileName: string): string {
    // Calcula as diferenças por linha
    const differences = diff.diffLines(originalText, modifiedText);
    
    let htmlRows = '';
    
    function renderModifiedLine(oldLine: string, newLine: string) {
        const wordDiff = diff.diffWordsWithSpace(oldLine, newLine);
        
        let leftHtml = '';
        let rightHtml = '';
        
        wordDiff.forEach(part => {
            const escaped = escapeHtml(part.value);
            if (part.removed) {
                leftHtml += `<span class="TextSegSigDiff">${escaped}</span>`;
            } else if (part.added) {
                rightHtml += `<span class="TextSegSigDiff">${escaped}</span>`;
            } else {
                leftHtml += escaped;
                rightHtml += escaped;
            }
        });

        return `
<tr class="SectionMiddle">
<td class="TextItemSigDiffMod Wrap">${leftHtml || '&nbsp;'}</td>
<td class="AlignCenter Wrap">&lt;&gt;</td>
<td class="TextItemSigDiffMod Wrap">${rightHtml || '&nbsp;'}</td>
</tr>`;
    }
    
    for (let i = 0; i < differences.length; i++) {
        const part = differences[i];
        
        let lines = part.value.split('\n');
        if (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }

        // Detectar modificações (remoção seguida de adição)
        if (part.removed && i + 1 < differences.length && differences[i + 1].added) {
            const nextPart = differences[i + 1];
            let nextLines = nextPart.value.split('\n');
            if (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
                nextLines.pop();
            }
            
            const minLines = Math.min(lines.length, nextLines.length);
            
            // Linhas pareadas viram "modificações" com análise de palavras
            for (let j = 0; j < minLines; j++) {
                htmlRows += renderModifiedLine(lines[j], nextLines[j]);
            }
            
            // O que sobrar da remoção vira exclusão pura
            for (let j = minLines; j < lines.length; j++) {
                const escapedLine = escapeHtml(lines[j]) || '&nbsp;';
                htmlRows += `
<tr class="SectionMiddle">
<td class="TextItemSigDel Wrap"><span class="TextSegSigDiff">${escapedLine}</span></td>
<td class="AlignCenter Wrap">&lt;</td>
<td class="TextItemSame Wrap">&nbsp;</td>
</tr>`;
            }
            
            // O que sobrar da adição vira adição pura
            for (let j = minLines; j < nextLines.length; j++) {
                const escapedLine = escapeHtml(nextLines[j]) || '&nbsp;';
                htmlRows += `
<tr class="SectionMiddle">
<td class="TextItemSame Wrap">&nbsp;</td>
<td class="AlignCenter Wrap">&gt;</td>
<td class="TextItemSigAdd Wrap"><span class="TextSegSigDiff">${escapedLine}</span></td>
</tr>`;
            }
            
            i++; // Pula o bloco adicionado que já foi processado
            continue;
        }

        // Fluxo normal para blocos puramente adicionais, removidos ou iguais
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
    }

    // Substitui no template
    let finalHtml = baseContent.replace('[[CONTEUDO_COMPARADO]]', () => htmlRows.trim());
    
    const finalName = fileName.trim() || 'COMPARACAO_TEXTO';
    finalHtml = finalHtml.replace(/\[\[NOME_FORM\]\]/g, () => finalName);
    
    return finalHtml;
}

export async function handleTextProcess(originalText: string, modifiedText: string, baseContent: string, fileName: string) {
    try {
        const finalName = fileName.trim() || 'COMPARACAO_TEXTO';
        const finalHtml = generateDiffHtml(originalText, modifiedText, baseContent, finalName);
        
        // Download
        const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
        saveAs(blob, `${finalName}_INTERATIVO.HTML`);
        
    } catch (e: any) {
        alert(`Erro ao processar a comparação: ${e.message}`);
        console.error(e);
    }
}
