import { FoxProParser } from './foxproParser';

export interface CustomizedItem {
    id: string;
    name: string;
    category: 'FORM' | 'PRG' | 'REPORT' | 'OTHER';
    relativePathCustom: string; // Fora da STOB (ex: "ABERTURAGRADE_AJUSTEESTOQUE.SCX" ou "OBJETOS/MEUPROGRAMA.PRG")
    relativePathStandard: string; // Dentro da STOB (ex: "STOB/ABERTURAGRADE_AJUSTEESTOQUE.SCX" ou "STOB/OBJETOS/MEUPROGRAMA.PRG")
    customFiles: { primary?: File; binaryMemo?: File };
    standardFiles: { primary?: File; binaryMemo?: File };
    hasChanges: boolean;
    standardText?: string;
    customText?: string;
    error?: string;
}

export interface AnalysisSummary {
    totalCustomizations: number;
    hasChangesCount: number;
    noChangesCount: number;
    formCount: number;
    prgCount: number;
    reportCount: number;
    otherCount: number;
    items: CustomizedItem[];
}

interface FileGroup {
    basePath: string; // Ex: "ABERTURAGRADE" ou "OBJETOS/MEUPROGRAMA"
    category: 'FORM' | 'PRG' | 'REPORT' | 'OTHER';
    displayName: string;
    primaryExt: string;
    primaryFile?: File;
    binaryMemoFile?: File;
    fullRelativePath: string;
}

export async function analyzeRepositoryCustomizations(
    files: FileList | File[],
    onProgress: (message: string, percent?: number) => void
): Promise<AnalysisSummary> {
    const parser = new FoxProParser();
    const outsideGroups = new Map<string, FileGroup>();
    const insideStobGroups = new Map<string, FileGroup>();

    const totalFiles = files.length;
    onProgress(`Lendo e mapeando repositório (0 de ${totalFiles.toLocaleString()} arquivos)...`, 0);

    for (let i = 0; i < totalFiles; i++) {
        // Atualiza o progresso visual a cada 500 arquivos para não travar a UI
        if (i % 500 === 0 || i === totalFiles - 1) {
            const mapPercent = Math.round(((i + 1) / totalFiles) * 30);
            onProgress(`Lendo e mapeando repositório (${(i + 1).toLocaleString()} de ${totalFiles.toLocaleString()} arquivos)...`, mapPercent);
            await new Promise(r => setTimeout(r, 0));
        }

        const file = files[i];
        const relativePath = file.webkitRelativePath || file.name;
        const parts = relativePath.split('/');
        
        // Se houver pasta raiz (ex: VolpeHomolog/...), pega o caminho interno
        const internalPath = parts.length > 1 ? parts.slice(1).join('/') : relativePath;
        const upperInternal = internalPath.toUpperCase();

        const isStob = upperInternal.startsWith('STOB/') || upperInternal === 'STOB';
        const cleanPath = isStob ? internalPath.substring(5) : internalPath;

        // Extrai extensão e base
        const lastDot = cleanPath.lastIndexOf('.');
        if (lastDot === -1) continue;

        const ext = cleanPath.substring(lastDot + 1).toLowerCase();
        const basePath = cleanPath.substring(0, lastDot);
        const upperBasePath = basePath.toUpperCase();

        let category: 'FORM' | 'PRG' | 'REPORT' | 'OTHER' = 'OTHER';
        if (ext === 'scx' || ext === 'sct') category = 'FORM';
        else if (ext === 'prg') category = 'PRG';
        else if (ext === 'frx' || ext === 'frt') category = 'REPORT';
        else if (ext === 'vcx' || ext === 'vct') category = 'OTHER';
        else continue; // Foco em arquivos de fonte / telas / relatórios do FoxPro e texto

        const targetMap = isStob ? insideStobGroups : outsideGroups;

        if (!targetMap.has(upperBasePath)) {
            const pathParts = cleanPath.split('/');
            const fileNameWithExt = pathParts[pathParts.length - 1];
            const displayName = fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.')).toUpperCase();

            targetMap.set(upperBasePath, {
                basePath: cleanPath,
                category,
                displayName,
                primaryExt: ext,
                fullRelativePath: cleanPath
            });
        }

        const group = targetMap.get(upperBasePath)!;
        if (ext === 'scx' || ext === 'frx' || ext === 'vcx' || ext === 'prg') {
            group.primaryFile = file;
            group.primaryExt = ext;
            group.fullRelativePath = cleanPath;
        } else if (ext === 'sct' || ext === 'frt' || ext === 'vct') {
            group.binaryMemoFile = file;
        }
    }

    onProgress('Identificando telas e arquivos customizados...', 30);
    await new Promise(r => setTimeout(r, 10));

    const customItems: CustomizedItem[] = [];
    let itemIdSeq = 1;

    // Filtra APENAS os arquivos fora da STOB que POSSUEM a sua cópia idêntica no caminho da STOB
    for (const [upperBasePath, customGroup] of outsideGroups.entries()) {
        const standardGroup = insideStobGroups.get(upperBasePath);

        // Se NÃO existir cópia na STOB, ignora (desenvolvimento paralelo)
        if (!standardGroup) continue;

        // Verifica se temos os arquivos necessários para o par
        const hasCustomPrimary = !!customGroup.primaryFile;
        const hasStandardPrimary = !!standardGroup.primaryFile;

        if (!hasCustomPrimary || !hasStandardPrimary) continue;

        const relativePathCustom = customGroup.fullRelativePath;
        const relativePathStandard = `STOB/${standardGroup.fullRelativePath}`;

        customItems.push({
            id: `custom_${itemIdSeq++}`,
            name: customGroup.displayName,
            category: customGroup.category,
            relativePathCustom,
            relativePathStandard,
            customFiles: {
                primary: customGroup.primaryFile,
                binaryMemo: customGroup.binaryMemoFile
            },
            standardFiles: {
                primary: standardGroup.primaryFile,
                binaryMemo: standardGroup.binaryMemoFile
            },
            hasChanges: false
        });
    }

    onProgress(`Analisando conteúdo e alterações em ${customItems.length} customizações encontradas...`, 30);
    await new Promise(r => setTimeout(r, 10));

    const totalCustom = customItems.length;
    for (let i = 0; i < totalCustom; i++) {
        const item = customItems[i];
        const percent = 30 + Math.round(((i + 1) / (totalCustom || 1)) * 70);

        onProgress(`Comparando [${i + 1}/${totalCustom}]: ${item.name} (${item.category})...`, percent);
        await new Promise(r => setTimeout(r, 0));

        try {
            const standardText = await extractTextContent(parser, item.standardFiles.primary, item.standardFiles.binaryMemo);
            const customText = await extractTextContent(parser, item.customFiles.primary, item.customFiles.binaryMemo);

            item.standardText = standardText;
            item.customText = customText;

            // Comparar textos ignorando diferenças de quebra de linha (\r\n vs \n) e maiúsculas/minúsculas (case-insensitive)
            const normStandard = standardText.replace(/\r\n/g, '\n').trim().toLowerCase();
            const normCustom = customText.replace(/\r\n/g, '\n').trim().toLowerCase();

            item.hasChanges = normStandard !== normCustom;
        } catch (err: any) {
            console.error(`Erro ao analisar ${item.name}:`, err);
            item.error = err?.message || 'Erro ao processar arquivo';
            item.hasChanges = true; // Marca como com alteração/atenção se houve erro
        }
    }

    // Ordenar itens: primeiro os que têm alteração, depois por nome
    customItems.sort((a, b) => {
        if (a.hasChanges !== b.hasChanges) {
            return a.hasChanges ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    const summary: AnalysisSummary = {
        totalCustomizations: customItems.length,
        hasChangesCount: customItems.filter(i => i.hasChanges && !i.error).length,
        noChangesCount: customItems.filter(i => !i.hasChanges && !i.error).length,
        formCount: customItems.filter(i => i.category === 'FORM').length,
        prgCount: customItems.filter(i => i.category === 'PRG').length,
        reportCount: customItems.filter(i => i.category === 'REPORT').length,
        otherCount: customItems.filter(i => i.category === 'OTHER').length,
        items: customItems
    };

    return summary;
}

async function extractTextContent(
    parser: FoxProParser,
    primaryFile?: File,
    binaryMemoFile?: File
): Promise<string> {
    if (!primaryFile) return '';

    const ext = primaryFile.name.split('.').pop()?.toLowerCase();

    if (ext === 'prg') {
        const buf = await primaryFile.arrayBuffer();
        const decoder = new TextDecoder('windows-1252');
        const text = decoder.decode(buf);
        return parser.parsePrg(text);
    }

    if ((ext === 'scx' || ext === 'frx' || ext === 'vcx') && binaryMemoFile) {
        const primBuf = await primaryFile.arrayBuffer();
        const memoBuf = await binaryMemoFile.arrayBuffer();
        return parser.parse(primBuf, memoBuf);
    }

    // Se for arquivo de texto simples
    const buf = await primaryFile.arrayBuffer();
    const decoder = new TextDecoder('windows-1252');
    return decoder.decode(buf);
}
