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

export function generateDiffRows(originalText: string, modifiedText: string, ignoreCase: boolean = true): string {
    const normOriginal = originalText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(l => l.trimEnd())
        .join('\n');

    const normModified = modifiedText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(l => l.trimEnd())
        .join('\n');

    const differences = (diff as any).diffLines(normOriginal, normModified, { ignoreCase });
    
    let htmlRows = '';
    function renderModifiedLine(oldLine: string, newLine: string) {
        if (oldLine.trim() === '' && newLine.trim() === '') {
            return `
<tr class="SectionMiddle">
<td class="TextItemSame Wrap">&nbsp;</td>
<td class="AlignCenter Wrap">=</td>
<td class="TextItemSame Wrap">&nbsp;</td>
</tr>`;
        }

        const isSame = ignoreCase 
            ? oldLine.trimEnd().toLowerCase() === newLine.trimEnd().toLowerCase()
            : oldLine.trimEnd() === newLine.trimEnd();

        if (isSame) {
            return `
<tr class="SectionMiddle">
<td class="TextItemSame Wrap">${escapeHtml(oldLine) || '&nbsp;'}</td>
<td class="AlignCenter Wrap">=</td>
<td class="TextItemSame Wrap">${escapeHtml(newLine) || '&nbsp;'}</td>
</tr>`;
        }

        const wordDiff = (diff as any).diffWordsWithSpace(oldLine, newLine, { ignoreCase });
        
        let leftHtml = '';
        let rightHtml = '';
        
        wordDiff.forEach((part: any) => {
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

        if (!leftHtml.includes('TextSegSigDiff') && !rightHtml.includes('TextSegSigDiff')) {
            return `
<tr class="SectionMiddle">
<td class="TextItemSame Wrap">${leftHtml || '&nbsp;'}</td>
<td class="AlignCenter Wrap">=</td>
<td class="TextItemSame Wrap">${rightHtml || '&nbsp;'}</td>
</tr>`;
        }

        return `
<tr class="SectionMiddle">
<td class="TextItemSigDiffMod Wrap">${leftHtml || '&nbsp;'}</td>
<td class="AlignCenter Wrap">&lt;&gt;</td>
<td class="TextItemSigDiffMod Wrap">${rightHtml || '&nbsp;'}</td>
</tr>`;
    }

    // Iterar cada parte das diferenças
    for (let i = 0; i < differences.length; i++) {
        const part = differences[i];

        // Se for uma alteração (removido seguido imediatamente de adicionado)
        if (part.removed && i + 1 < differences.length && differences[i + 1].added) {
            const nextPart = differences[i + 1];

            // Dividir em linhas para tentar alinhar alteração por linha
            const removedLines = part.value.split('\n');
            if (removedLines[removedLines.length - 1] === '') removedLines.pop();
            const addedLines = nextPart.value.split('\n');
            if (addedLines[addedLines.length - 1] === '') addedLines.pop();

            const maxLines = Math.max(removedLines.length, addedLines.length);

            for (let j = 0; j < maxLines; j++) {
                const rem = removedLines[j];
                const add = addedLines[j];

                if (rem !== undefined && add !== undefined) {
                    htmlRows += renderModifiedLine(rem, add);
                } else if (rem !== undefined) {
                    htmlRows += `
<tr class="SectionMiddle">
<td class="TextItemSigDel Wrap"><span class="TextSegSigDiff">${escapeHtml(rem)}</span></td>
<td class="AlignCenter Wrap">&lt;</td>
<td class="TextItemSame Wrap">&nbsp;</td>
</tr>`;
                } else if (add !== undefined) {
                    htmlRows += `
<tr class="SectionMiddle">
<td class="TextItemSame Wrap">&nbsp;</td>
<td class="AlignCenter Wrap">&gt;</td>
<td class="TextItemSigAdd Wrap"><span class="TextSegSigDiff">${escapeHtml(add)}</span></td>
</tr>`;
                }
            }

            // Pular o próximo item pois já foi processado conjuntamente
            i++;
            continue;
        }

        // Casos normais: Apenas Adicionado, Apenas Removido ou Sem alteração
        const lines = part.value.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();

        lines.forEach((line: string) => {
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

    return htmlRows.trim();
}

export function generateDiffHtml(originalText: string, modifiedText: string, baseContent: string, fileName: string, customPrefix: string = '', ignoreCase: boolean = true): string {
    const htmlRows = generateDiffRows(originalText, modifiedText, ignoreCase);

    // Substitui no template
    let finalHtml = baseContent.replace('[[CONTEUDO_COMPARADO]]', () => htmlRows);
    
    const prefixStr = customPrefix && customPrefix.trim() ? ` ${customPrefix.trim()}` : '';
    finalHtml = finalHtml.replace(/\[\[PREFIXO_DIFERENCAS\]\]/g, () => prefixStr);
    
    const finalName = fileName.trim() || 'COMPARACAO_TEXTO';
    finalHtml = finalHtml.replace(/\[\[NOME_FORM\]\]/g, () => finalName);
    
    return finalHtml;
}

export async function handleTextProcess(originalText: string, modifiedText: string, baseContent: string, fileName: string, customPrefix: string = '') {
    try {
        const finalName = fileName.trim() || 'COMPARACAO_TEXTO';
        const finalHtml = generateDiffHtml(originalText, modifiedText, baseContent, finalName, customPrefix);
        
        // Download
        const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
        saveAs(blob, `${finalName}_INTERATIVO.HTML`);
        
    } catch (e: any) {
        alert(`Erro ao processar a comparação: ${e.message}`);
        console.error(e);
    }
}
