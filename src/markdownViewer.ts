import { Marked, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/common';
import { saveAs } from 'file-saver';
import projectReadmeRaw from '../README.md?raw';

export interface MarkdownStats {
  words: number;
  chars: number;
  lines: number;
  readingTimeMinutes: number;
  headingCount: number;
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface RenderResult {
  html: string;
  stats: MarkdownStats;
  toc: TocItem[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export const DEMO_MARKDOWN = `# 🚀 Guia de Documentação e Recursos Técnicos

Bem-vindo ao **Leitor de Markdown** do Comparador PWI! Esta ferramenta foi projetada para ler, editar e inspecionar arquivos \`.md\` com tipografia refinada, realce de sintaxe de ponta e suporte completo ao padrão GitHub Flavored Markdown (GFM).

---

## 📌 Alertas e Destaques (GitHub Alerts)

> [!NOTE]
> Este leitor processa arquivos **100% no seu navegador**, garantindo privacidade total de dados e código sem enviar nada para servidores externos.

> [!TIP]
> Você pode arrastar e soltar qualquer arquivo \`.md\` diretamente na tela para abri-lo instantaneamente!

> [!IMPORTANT]
> Use os modos **Lado a Lado** para editar e ver em tempo real, ou **Apenas Prévia** para leitura confortável e sem distrações.

> [!WARNING]
> Certifique-se de que caracteres especiais e códigos SQL estejam devidamente formatados entre crases para melhor legibilidade.

> [!CAUTION]
> Ao compartilhar arquivos exportados com dados confidenciais, revise os trechos sensíveis antes do envio.

---

## 💻 Blocos de Código com Realce de Sintaxe

### Consulta SQL Server (Showplan & Tuning)
\`\`\`sql
-- Busca otimizada com índice seletivo e eliminação de Key Lookup
SELECT 
    c.IdCliente,
    c.NomeRazaoSocial,
    p.NumeroPedido,
    p.DataEmissao,
    SUM(i.Quantidade * i.PrecoUnitario) AS ValorTotal
FROM dbo.Clientes AS c WITH (NOLOCK)
INNER JOIN dbo.Pedidos AS p ON p.IdCliente = c.IdCliente
INNER JOIN dbo.ItensPedido AS i ON i.IdPedido = p.IdPedido
WHERE c.Ativo = 1 
  AND p.DataEmissao >= '2026-01-01'
GROUP BY c.IdCliente, c.NomeRazaoSocial, p.NumeroPedido, p.DataEmissao
ORDER BY p.DataEmissao DESC;
\`\`\`

### Exemplo TypeScript / JavaScript
\`\`\`typescript
interface ComparacaoResultado {
  arquivo: string;
  linhasAdicionadas: number;
  linhasRemovidas: number;
  status: 'modificado' | 'novo' | 'sem_alteracao';
}

export function analisarDiferencas(original: string, modificado: string): ComparacaoResultado {
  const igual = original.trim() === modificado.trim();
  return {
    arquivo: 'exemplo.prg',
    linhasAdicionadas: igual ? 0 : 12,
    linhasRemovidas: igual ? 0 : 4,
    status: igual ? 'sem_alteracao' : 'modificado'
  };
}
\`\`\`

### Rotina FoxPro (.PRG)
\`\`\`foxpro
*-- Processamento de Faturas
LOCAL lnTotal, lcStatus
lnTotal = 0.00
lcStatus = "ABERTO"

SELECT faturas
SCAN FOR status == lcStatus
    lnTotal = lnTotal + vl_total
    DO AtualizarStatus WITH nr_fatura, "PROCESSADO"
ENDSCAN

MESSAGEBOX("Total faturado: " + TRANSFORM(lnTotal, "@E 999,999,999.99"), 64, "Sucesso")
\`\`\`

---

## 📊 Tabelas Formatadas

| Recurso | Suporte Web | Atalho de Teclado | Status |
| :--- | :---: | :---: | :--- |
| **Leitor de XML** | Sim | <kbd>Ctrl</kbd> + <kbd>V</kbd> | Estável ✅ |
| **Comparador FoxPro** | Sim | <kbd>Ctrl</kbd> + <kbd>O</kbd> | Estável ✅ |
| **Plano SQL (Showplan)** | Sim | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> | Ativo ⚡ |
| **Visualizador Markdown** | Sim | <kbd>Ctrl</kbd> + <kbd>M</kbd> | Novo 🚀 |

---

## ✅ Lista de Tarefas (Checklist Interativo)

- [x] Implementar leitor de Markdown moderno e bonito
- [x] Suporte a tabelas e alertas do GitHub (\`[!NOTE]\`, \`[!TIP]\`, etc.)
- [x] Realce de código com botão de cópia com um clique
- [x] Geração automática de Sumário / Índice navegável
- [ ] Exportação direta em PDF e impressão estilizada
- [x] Modo Tela Cheia (Zen Mode) e sincronização visual

---

## 💬 Citações e Notas de Rodapé

> "A simplicidade é o último grau de sofisticação."
> — *Leonardo da Vinci*

Use o painel lateral de sumário para pular rapidamente entre seções deste documento!
`;

export class MarkdownViewerController {
  private markedInstance: Marked;
  private currentToc: TocItem[] = [];
  private slugCounts = new Map<string, number>();

  constructor() {
    this.markedInstance = new Marked({
      gfm: true,
      breaks: true
    });

    this.configureMarked();
  }

  private configureMarked() {
    hljs.registerAliases(['foxpro', 'vfp', 'prg'], { languageName: 'sql' });

    const self = this;

    this.markedInstance.use({
      renderer: {
        heading({ tokens, depth }: Tokens.Heading) {
          const plainText = tokens
            .map((t) => ('text' in t ? (t as { text: string }).text : ''))
            .join('')
            .trim() || `secao-${self.currentToc.length + 1}`;

          let slug = slugify(plainText);
          if (!slug) slug = `secao-${self.currentToc.length + 1}`;

          const count = (self.slugCounts.get(slug) || 0) + 1;
          self.slugCounts.set(slug, count);
          if (count > 1) {
            slug = `${slug}-${count}`;
          }

          self.currentToc.push({
            id: slug,
            text: plainText,
            level: depth
          });

          const innerHtml = this.parser.parseInline(tokens);

          return `
<h${depth} id="${slug}" class="group relative flex items-center justify-between">
  <span>${innerHtml}</span>
  <a href="#${slug}" class="opacity-0 group-hover:opacity-100 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 no-underline text-sm font-mono px-1.5 py-0.5 rounded transition-opacity" title="Link direto para este tópico">#</a>
</h${depth}>\n`;
        },

        code({ text, lang }: Tokens.Code) {
          const cleanLang = (lang || '').trim().toLowerCase().split(/\s+/)[0];
          let highlighted = '';
          let displayLang = cleanLang ? cleanLang.toUpperCase() : 'TEXTO';

          if (cleanLang && hljs.getLanguage(cleanLang)) {
            try {
              highlighted = hljs.highlight(text, { language: cleanLang, ignoreIllegals: true }).value;
            } catch {
              highlighted = escapeHtml(text);
            }
          } else {
            try {
              const auto = hljs.highlightAuto(text);
              highlighted = auto.value;
              if (auto.language) displayLang = auto.language.toUpperCase();
            } catch {
              highlighted = escapeHtml(text);
            }
          }

          const encodedRaw = encodeURIComponent(text);

          return `
<div class="md-code-block group">
  <div class="md-code-header">
    <span class="md-code-lang">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
      ${escapeHtml(displayLang)}
    </span>
    <button type="button" class="md-copy-btn" data-code="${encodedRaw}" title="Copiar código">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
      <span>Copiar</span>
    </button>
  </div>
  <pre><code class="hljs language-${cleanLang}">${highlighted}</code></pre>
</div>\n`;
        },

        blockquote({ tokens }: Tokens.Blockquote) {
          const html = this.parser.parse(tokens);
          const alertMatch = html.match(/^\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*<br\s*\/?>|\s*\n)?([\s\S]*?)<\/p>([\s\S]*)$/i);

          if (alertMatch) {
            const type = alertMatch[1].toUpperCase();
            const firstLineContent = alertMatch[2];
            const remainingContent = alertMatch[3];

            const alertConfigs: Record<string, { label: string; icon: string; cssClass: string }> = {
              NOTE: {
                label: 'Nota',
                icon: '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
                cssClass: 'md-alert-note'
              },
              TIP: {
                label: 'Dica',
                icon: '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>',
                cssClass: 'md-alert-tip'
              },
              IMPORTANT: {
                label: 'Importante',
                icon: '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
                cssClass: 'md-alert-important'
              },
              WARNING: {
                label: 'Atenção',
                icon: '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
                cssClass: 'md-alert-warning'
              },
              CAUTION: {
                label: 'Cuidado',
                icon: '<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>',
                cssClass: 'md-alert-caution'
              }
            };

            const cfg = alertConfigs[type] || alertConfigs.NOTE;
            const content = (firstLineContent ? `<p>${firstLineContent}</p>` : '') + remainingContent;

            return `
<div class="md-alert ${cfg.cssClass}">
  <div class="md-alert-header">
    ${cfg.icon}
    <span>${cfg.label}</span>
  </div>
  <div class="md-alert-content">
    ${content}
  </div>
</div>\n`;
          }

          return `<blockquote>\n${html}</blockquote>\n`;
        },

        table(token: Tokens.Table) {
          let headerHtml = '';
          for (const cell of token.header) {
            headerHtml += `<th align="${cell.align || 'left'}">${this.parser.parseInline(cell.tokens)}</th>`;
          }
          let bodyHtml = '';
          for (const row of token.rows) {
            let rowCells = '';
            for (const cell of row) {
              rowCells += `<td align="${cell.align || 'left'}">${this.parser.parseInline(cell.tokens)}</td>`;
            }
            bodyHtml += `<tr>${rowCells}</tr>\n`;
          }
          return `<div class="md-table-wrapper"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>\n`;
        },

        link({ href, title, tokens }: Tokens.Link) {
          const text = this.parser.parseInline(tokens);
          const isExternal = href.startsWith('http://') || href.startsWith('https://');
          const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
          return `<a href="${escapeHtml(href)}"${titleAttr}${target}>${text}</a>`;
        }
      }
    });
  }

  public render(markdownText: string): RenderResult {
    this.currentToc = [];
    this.slugCounts.clear();

    const rawHtml = this.markedInstance.parse(markdownText) as string;

    const stats = this.calculateStats(markdownText, this.currentToc.length);

    return {
      html: rawHtml,
      stats,
      toc: [...this.currentToc]
    };
  }

  private calculateStats(text: string, headingCount: number): MarkdownStats {
    const clean = text.trim();
    if (!clean) {
      return { words: 0, chars: 0, lines: 0, readingTimeMinutes: 0, headingCount: 0 };
    }

    const lines = clean.split(/\r\n|\r|\n/).length;
    const chars = clean.length;
    // Extrai palavras ignorando pontuação pesada e tags
    const wordsMatch = clean.replace(/<[^>]+>/g, '').match(/[\wÀ-ÿ]+/g);
    const words = wordsMatch ? wordsMatch.length : 0;
    const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

    return {
      words,
      chars,
      lines,
      readingTimeMinutes,
      headingCount
    };
  }
}

export function exportStandaloneHtml(title: string, _markdownRaw: string, renderedHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title || 'Documento Markdown')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;0,900;1,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #ffffff;
      --text: #1e293b;
      --border: #e2e8f0;
      --card-bg: #f8fafc;
      --primary: #4f46e5;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #090d16;
        --text: #e2e8f0;
        --border: #1e293b;
        --card-bg: #0f172a;
        --primary: #818cf8;
      }
    }
    body {
      font-family: 'Lato', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.7;
      margin: 0;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 2.5rem;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
    }
    .doc-header {
      border-bottom: 2px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .doc-meta {
      font-size: 0.85rem;
      color: #64748b;
    }
    .markdown-body h1, .markdown-body h2, .markdown-body h3 {
      font-weight: 700;
      line-height: 1.3;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    .markdown-body h1 { font-size: 2rem; border-bottom: 2px solid var(--border); padding-bottom: 0.3em; }
    .markdown-body h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    .markdown-body h3 { font-size: 1.25rem; }
    .markdown-body a { color: var(--primary); text-decoration: underline; }
    .markdown-body pre { background: #0f172a; color: #f8fafc; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; font-size: 0.875rem; }
    .markdown-body code { font-family: ui-monospace, monospace; }
    .markdown-body :not(pre) > code { background: rgba(99,102,241,0.1); color: var(--primary); padding: 0.15em 0.35em; border-radius: 0.25rem; font-size: 0.85em; }
    .markdown-body blockquote { border-left: 4px solid var(--primary); margin: 1em 0; padding: 0.5em 1em; background: rgba(99,102,241,0.05); border-radius: 0 0.5rem 0.5rem 0; }
    .markdown-body table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9rem; }
    .markdown-body th, .markdown-body td { padding: 0.65rem 1rem; border: 1px solid var(--border); }
    .markdown-body th { background: rgba(0,0,0,0.03); }
    .markdown-body img { max-width: 100%; height: auto; border-radius: 0.5rem; }
    .md-code-header, .md-copy-btn { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="doc-header">
      <div>
        <h1 style="margin: 0; font-size: 1.5rem; border: none; padding: 0;">${escapeHtml(title || 'Documento')}</h1>
        <div class="doc-meta">Gerado pelo Leitor de Markdown PWI • ${new Date().toLocaleDateString('pt-BR')}</div>
      </div>
    </div>
    <div class="markdown-body">
      ${renderedHtml}
    </div>
  </div>
</body>
</html>`;
}

export function initMarkdownViewerUI() {
  const controller = new MarkdownViewerController();

  const sectionMarkdown = document.getElementById('section-markdown') as HTMLElement | null;

  const markdownInput = document.getElementById('md-editor-input') as HTMLTextAreaElement | null;
  const markdownPreviewContent = document.getElementById('md-preview-content') as HTMLElement | null;
  const markdownPreviewContainer = document.getElementById('md-preview-container') as HTMLElement | null;
  const markdownTocList = document.getElementById('md-toc-list') as HTMLElement | null;
  const markdownTocCount = document.getElementById('md-toc-count') as HTMLElement | null;
  const markdownFileName = document.getElementById('md-current-filename') as HTMLElement | null;

  // Stats
  const statWords = document.getElementById('md-stat-words') as HTMLElement | null;
  const statChars = document.getElementById('md-stat-chars') as HTMLElement | null;
  const statLines = document.getElementById('md-stat-lines') as HTMLElement | null;
  const statReadTime = document.getElementById('md-stat-readtime') as HTMLElement | null;

  // Buttons & Controls
  const fileInput = document.getElementById('md-file-input') as HTMLInputElement | null;
  const btnOpenFile = document.getElementById('btn-md-open-file') as HTMLButtonElement | null;
  const btnLoadExample = document.getElementById('btn-md-load-example') as HTMLButtonElement | null;
  const btnLoadReadme = document.getElementById('btn-md-load-readme') as HTMLButtonElement | null;
  const btnClear = document.getElementById('btn-md-clear') as HTMLButtonElement | null;
  const btnCopyMarkdown = document.getElementById('btn-md-copy-markdown') as HTMLButtonElement | null;
  const btnCopyHtml = document.getElementById('btn-md-copy-html') as HTMLButtonElement | null;
  const btnExportHtml = document.getElementById('btn-md-export-html') as HTMLButtonElement | null;
  const btnPrint = document.getElementById('btn-md-print') as HTMLButtonElement | null;
  const btnFullscreen = document.getElementById('btn-md-fullscreen') as HTMLButtonElement | null;

  // View Mode Buttons
  const btnViewSplit = document.getElementById('btn-md-view-split') as HTMLButtonElement | null;
  const btnViewPreview = document.getElementById('btn-md-view-preview') as HTMLButtonElement | null;
  const btnViewEditor = document.getElementById('btn-md-view-editor') as HTMLButtonElement | null;

  // Panes
  const panesContainer = document.getElementById('md-panes-container') as HTMLElement | null;
  const paneEditor = document.getElementById('md-pane-editor') as HTMLElement | null;
  const panePreview = document.getElementById('md-pane-preview') as HTMLElement | null;
  const paneToc = document.getElementById('md-pane-toc') as HTMLElement | null;
  const btnToggleToc = document.getElementById('btn-md-toggle-toc') as HTMLButtonElement | null;

  // Search
  const searchInput = document.getElementById('md-search-input') as HTMLInputElement | null;
  const searchMatchCount = document.getElementById('md-search-match-count') as HTMLElement | null;

  let currentFileName = 'documento.md';
  let lastRawMarkdown = '';
  let lastRenderedHtml = '';

  function updateView(content: string, fileName?: string) {
    if (fileName) {
      currentFileName = fileName;
      if (markdownFileName) markdownFileName.textContent = fileName;
    }

    lastRawMarkdown = content;
    const { html, stats, toc } = controller.render(content);
    lastRenderedHtml = html;

    // Render HTML in preview
    if (markdownPreviewContent) {
      if (!content.trim()) {
        markdownPreviewContent.innerHTML = `
          <div class="py-16 text-center text-gray-400 dark:text-slate-500">
            <svg class="w-16 h-16 mx-auto mb-4 opacity-40 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <p class="text-base font-semibold">Nenhum conteúdo Markdown para visualizar</p>
            <p class="text-xs text-gray-500 dark:text-slate-500 mt-1">Digite no editor à esquerda, carregue um arquivo .md ou use os botões de exemplo acima.</p>
          </div>
        `;
      } else {
        markdownPreviewContent.innerHTML = html;
      }
    }

    // Update Stats
    if (statWords) statWords.textContent = stats.words.toLocaleString('pt-BR');
    if (statChars) statChars.textContent = stats.chars.toLocaleString('pt-BR');
    if (statLines) statLines.textContent = stats.lines.toLocaleString('pt-BR');
    if (statReadTime) statReadTime.textContent = `~${stats.readingTimeMinutes} min`;

    // Update TOC
    renderToc(toc);

    // Reapply search highlight if there is search text
    if (searchInput && searchInput.value.trim()) {
      applySearchHighlight(searchInput.value.trim());
    }
  }

  function renderToc(toc: TocItem[]) {
    if (!markdownTocList) return;

    if (markdownTocCount) {
      markdownTocCount.textContent = `${toc.length}`;
    }

    if (toc.length === 0) {
      markdownTocList.innerHTML = `
        <div class="p-3 text-xs text-gray-400 dark:text-slate-500 text-center italic">
          Nenhum título (#, ##) encontrado
        </div>
      `;
      return;
    }

    markdownTocList.innerHTML = toc
      .map((item) => {
        const indentClass =
          item.level === 1 ? 'font-bold text-gray-800 dark:text-slate-200' :
          item.level === 2 ? 'pl-3 font-semibold text-gray-700 dark:text-slate-300' :
          item.level === 3 ? 'pl-6 text-gray-600 dark:text-slate-400 text-xs' :
          'pl-8 text-gray-500 dark:text-slate-500 text-xs';

        return `
          <a href="#${item.id}" class="toc-link block px-2 py-1.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs transition-colors truncate ${indentClass}" data-target="${item.id}" title="${escapeHtml(item.text)}">
            ${escapeHtml(item.text)}
          </a>
        `;
      })
      .join('');

    // Smooth scroll handling for TOC links
    markdownTocList.querySelectorAll('.toc-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = (link as HTMLElement).dataset.target;
        if (!targetId) return;
        const targetElem = document.getElementById(targetId);
        if (targetElem) {
          targetElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function applySearchHighlight(query: string) {
    if (!markdownPreviewContent) return;

    // Reset previous search marks
    const marks = markdownPreviewContent.querySelectorAll('mark.md-search-highlight');
    marks.forEach((m) => {
      const parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent || ''), m);
        parent.normalize();
      }
    });

    const cleanQuery = query.trim();
    if (!cleanQuery) {
      if (searchMatchCount) searchMatchCount.textContent = '0 resultados';
      return;
    }

    const walker = document.createTreeWalker(markdownPreviewContent, NodeFilter.SHOW_TEXT, null);
    const nodesToReplace: { node: Node; matches: { index: number; text: string }[] }[] = [];

    const regex = new RegExp(cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let totalMatches = 0;

    let currentNode = walker.nextNode();
    while (currentNode) {
      const text = currentNode.nodeValue || '';
      // Don't search inside pre/code blocks headers or scripts
      const parentTag = currentNode.parentElement?.tagName.toLowerCase();
      if (parentTag !== 'script' && parentTag !== 'style') {
        const matches: { index: number; text: string }[] = [];
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          matches.push({ index: match.index, text: match[0] });
          totalMatches++;
        }
        if (matches.length > 0) {
          nodesToReplace.push({ node: currentNode, matches });
        }
      }
      currentNode = walker.nextNode();
    }

    nodesToReplace.forEach(({ node, matches }) => {
      const text = node.nodeValue || '';
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      matches.forEach((m) => {
        if (m.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.index)));
        }
        const mark = document.createElement('mark');
        mark.className = 'md-search-highlight';
        mark.textContent = m.text;
        fragment.appendChild(mark);
        lastIndex = m.index + m.text.length;
      });

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      }

      node.parentNode?.replaceChild(fragment, node);
    });

    if (searchMatchCount) {
      searchMatchCount.textContent = `${totalMatches} encontrado${totalMatches === 1 ? '' : 's'}`;
    }

    // Scroll to first match
    const firstMark = markdownPreviewContent.querySelector('mark.md-search-highlight');
    if (firstMark) {
      firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // --- View Mode Logic ---
  function setViewMode(mode: 'split' | 'preview' | 'editor') {
    [btnViewSplit, btnViewPreview, btnViewEditor].forEach((btn) => {
      btn?.classList.remove('bg-indigo-600', 'text-white', 'dark:bg-indigo-500');
      btn?.classList.add('text-gray-700', 'dark:text-slate-300', 'hover:bg-gray-100', 'dark:hover:bg-slate-800');
    });

    if (mode === 'split') {
      btnViewSplit?.classList.add('bg-indigo-600', 'text-white', 'dark:bg-indigo-500');
      btnViewSplit?.classList.remove('text-gray-700', 'dark:text-slate-300');
      panesContainer?.classList.remove('lg:grid-cols-1');
      panesContainer?.classList.add('lg:grid-cols-2');
      paneEditor?.classList.remove('hidden');
      panePreview?.classList.remove('hidden');
    } else if (mode === 'preview') {
      btnViewPreview?.classList.add('bg-indigo-600', 'text-white', 'dark:bg-indigo-500');
      btnViewPreview?.classList.remove('text-gray-700', 'dark:text-slate-300');
      panesContainer?.classList.remove('lg:grid-cols-2');
      panesContainer?.classList.add('lg:grid-cols-1');
      paneEditor?.classList.add('hidden');
      panePreview?.classList.remove('hidden');
    } else if (mode === 'editor') {
      btnViewEditor?.classList.add('bg-indigo-600', 'text-white', 'dark:bg-indigo-500');
      btnViewEditor?.classList.remove('text-gray-700', 'dark:text-slate-300');
      panesContainer?.classList.remove('lg:grid-cols-2');
      panesContainer?.classList.add('lg:grid-cols-1');
      panePreview?.classList.add('hidden');
      paneEditor?.classList.remove('hidden');
    }
  }

  // --- Event Listeners ---

  // Live input typing with slight debounce
  let debounceTimeout: number | undefined;
  markdownInput?.addEventListener('input', () => {
    window.clearTimeout(debounceTimeout);
    debounceTimeout = window.setTimeout(() => {
      updateView(markdownInput.value);
    }, 150);
  });

  // View modes
  btnViewSplit?.addEventListener('click', () => setViewMode('split'));
  btnViewPreview?.addEventListener('click', () => setViewMode('preview'));
  btnViewEditor?.addEventListener('click', () => setViewMode('editor'));

  // Toggle TOC
  btnToggleToc?.addEventListener('click', () => {
    paneToc?.classList.toggle('hidden');
  });

  // Open file dialog
  btnOpenFile?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (markdownInput) markdownInput.value = content;
      updateView(content, file.name);
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  // Drag and Drop files onto container
  ['dragenter', 'dragover'].forEach((eventName) => {
    sectionMarkdown?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      sectionMarkdown.classList.add('ring-2', 'ring-indigo-500');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    sectionMarkdown?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      sectionMarkdown?.classList.remove('ring-2', 'ring-indigo-500');
    });
  });

  sectionMarkdown?.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (markdownInput) markdownInput.value = content;
        updateView(content, file.name);
      };
      reader.readAsText(file);
    }
  });

  // Load Example
  btnLoadExample?.addEventListener('click', () => {
    if (markdownInput) markdownInput.value = DEMO_MARKDOWN;
    updateView(DEMO_MARKDOWN, 'exemplo-recursos.md');
  });

  // Load Project README
  btnLoadReadme?.addEventListener('click', () => {
    if (markdownInput) markdownInput.value = projectReadmeRaw;
    updateView(projectReadmeRaw, 'README.md');
  });

  // Clear
  btnClear?.addEventListener('click', () => {
    if (markdownInput) markdownInput.value = '';
    updateView('', 'novo-documento.md');
    if (searchInput) searchInput.value = '';
    if (searchMatchCount) searchMatchCount.textContent = '0 resultados';
  });

  // Copy Markdown
  btnCopyMarkdown?.addEventListener('click', () => {
    if (!lastRawMarkdown.trim()) return;
    navigator.clipboard.writeText(lastRawMarkdown).then(() => {
      const span = btnCopyMarkdown.querySelector('span');
      const original = span?.textContent;
      if (span) span.textContent = 'Copiado! ✓';
      setTimeout(() => {
        if (span && original) span.textContent = original;
      }, 2000);
    });
  });

  // Copy HTML
  btnCopyHtml?.addEventListener('click', () => {
    if (!lastRenderedHtml.trim()) return;
    navigator.clipboard.writeText(lastRenderedHtml).then(() => {
      const span = btnCopyHtml.querySelector('span');
      const original = span?.textContent;
      if (span) span.textContent = 'HTML Copiado! ✓';
      setTimeout(() => {
        if (span && original) span.textContent = original;
      }, 2000);
    });
  });

  // Export HTML File
  btnExportHtml?.addEventListener('click', () => {
    if (!lastRenderedHtml.trim()) {
      alert('Não há conteúdo para exportar.');
      return;
    }
    const fullHtml = exportStandaloneHtml(currentFileName.replace(/\.md$/i, ''), lastRawMarkdown, lastRenderedHtml);
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const outName = currentFileName.replace(/\.md$/i, '') + '.html';
    saveAs(blob, outName);
  });

  // Print
  btnPrint?.addEventListener('click', () => {
    if (!markdownPreviewContent) return;

    // Create or populate temporary print area
    let printArea = document.getElementById('markdown-print-area');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'markdown-print-area';
      document.body.appendChild(printArea);
    }
    printArea.innerHTML = `
      <div style="margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 12px;">
        <h1 style="margin: 0; font-size: 24px;">${escapeHtml(currentFileName)}</h1>
        <small style="color: #666;">Exportado via Leitor de Markdown PWI em ${new Date().toLocaleString('pt-BR')}</small>
      </div>
      <div class="markdown-body">
        ${markdownPreviewContent.innerHTML}
      </div>
    `;

    window.print();
  });

  // Fullscreen
  btnFullscreen?.addEventListener('click', () => {
    if (!sectionMarkdown) return;
    if (!document.fullscreenElement) {
      sectionMarkdown.requestFullscreen().catch(() => {
        // Fallback: Toggle fixed fullscreen styling
        sectionMarkdown.classList.toggle('fixed');
        sectionMarkdown.classList.toggle('inset-0');
        sectionMarkdown.classList.toggle('z-50');
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Search input
  searchInput?.addEventListener('input', () => {
    applySearchHighlight(searchInput.value);
  });

  // Code Block Copy Button delegation
  markdownPreviewContainer?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.md-copy-btn') as HTMLButtonElement | null;
    if (!btn) return;

    const rawCode = decodeURIComponent(btn.dataset.code || '');
    navigator.clipboard.writeText(rawCode).then(() => {
      btn.classList.add('copied');
      const span = btn.querySelector('span');
      if (span) span.textContent = 'Copiado! ✓';
      setTimeout(() => {
        btn.classList.remove('copied');
        if (span) span.textContent = 'Copiar';
      }, 2000);
    });
  });

  // Load project README by default as initial preview!
  if (markdownInput && projectReadmeRaw) {
    markdownInput.value = projectReadmeRaw;
    updateView(projectReadmeRaw, 'README.md');
  }
}
