import { handleBatchProcess } from './batchProcessor.ts';
import { handleFoxProBatchProcess, type FoxProFileMap } from './batchProcessor.ts';
import { handleTextProcess, generateDiffHtml } from './textComparator.ts';
import { FoxProParser } from './foxproParser.ts';
import { handleCodeReferencesSearch, renderTreeResults } from './codeReferences.ts';
import { beautifyText, minifyText } from './beautifier.ts';
import { analyzeRepositoryCustomizations, type AnalysisSummary, type CustomizedItem } from './customizationAnalyzer.ts';
import { saveAs } from 'file-saver';
import baseHtmlTemplate from './base.html?raw';
import baseConsolidatedHtmlTemplate from './baseConsolidated.html?raw';

document.addEventListener('DOMContentLoaded', () => {
  // Tab Elements
  const tabBatch = document.getElementById('tab-batch') as HTMLButtonElement;
  const tabText = document.getElementById('tab-text') as HTMLButtonElement;
  const tabBeautifier = document.getElementById('tab-beautifier') as HTMLButtonElement;
  const tabFoxpro = document.getElementById('tab-foxpro') as HTMLButtonElement;
  const tabFoxproBatch = document.getElementById('tab-foxpro-batch') as HTMLButtonElement;
  const tabCodeReferences = document.getElementById('tab-code-references') as HTMLButtonElement;
  const tabCustomizations = document.getElementById('tab-customizations') as HTMLButtonElement;

  const sectionBatch = document.getElementById('section-batch') as HTMLElement;
  const sectionText = document.getElementById('section-text') as HTMLElement;
  const sectionBeautifier = document.getElementById('section-beautifier') as HTMLElement;
  const sectionFoxpro = document.getElementById('section-foxpro') as HTMLElement;
  const sectionFoxproBatch = document.getElementById('section-foxpro-batch') as HTMLElement;
  const sectionCodeReferences = document.getElementById('section-code-references') as HTMLElement;
  const sectionCustomizations = document.getElementById('section-customizations') as HTMLElement;

  // Batch Elements
  const compareFilesInput = document.getElementById('compare-files') as HTMLInputElement;
  const compareFilesCount = document.getElementById('compare-files-count') as HTMLElement;
  const btnProcessBatch = document.getElementById('btn-process-batch') as HTMLButtonElement;

  // Text Elements
  const textOriginal = document.getElementById('text-original') as HTMLTextAreaElement;
  const textModified = document.getElementById('text-modified') as HTMLTextAreaElement;
  const btnProcessText = document.getElementById('btn-process-text') as HTMLButtonElement;

  // FoxPro Elements
  const foxAntesFilesInput = document.getElementById('fox-antes-files') as HTMLInputElement;
  const foxAntesCount = document.getElementById('fox-antes-count') as HTMLElement;
  const foxDepoisFilesInput = document.getElementById('fox-depois-files') as HTMLInputElement;
  const foxDepoisCount = document.getElementById('fox-depois-count') as HTMLElement;
  const btnProcessFoxpro = document.getElementById('btn-process-foxpro') as HTMLButtonElement;
  const foxFileName = document.getElementById('fox-file-name') as HTMLInputElement;

  // FoxPro Batch Elements
  const foxBatchAntesDirInput = document.getElementById('fox-batch-antes-dir') as HTMLInputElement;
  const foxBatchAntesCount = document.getElementById('fox-batch-antes-count') as HTMLElement;
  const foxBatchDepoisDirInput = document.getElementById('fox-batch-depois-dir') as HTMLInputElement;
  const foxBatchDepoisCount = document.getElementById('fox-batch-depois-count') as HTMLElement;
  const btnProcessFoxproBatch = document.getElementById('btn-process-foxpro-batch') as HTMLButtonElement;

  // --- Tab Logic ---
  function resetTabs() {
    [tabBatch, tabText, tabBeautifier, tabFoxpro, tabFoxproBatch, tabCodeReferences, tabCustomizations].forEach(t => t?.classList.replace('tab-active', 'tab-inactive'));
    [sectionBatch, sectionText, sectionBeautifier, sectionFoxpro, sectionFoxproBatch, sectionCodeReferences, sectionCustomizations].forEach(s => s?.classList.add('hidden'));
  }

  tabBatch.addEventListener('click', () => {
    resetTabs();
    tabBatch.classList.replace('tab-inactive', 'tab-active');
    sectionBatch.classList.remove('hidden');
  });

  tabText.addEventListener('click', () => {
    resetTabs();
    tabText.classList.replace('tab-inactive', 'tab-active');
    sectionText.classList.remove('hidden');
  });

  tabBeautifier?.addEventListener('click', () => {
    resetTabs();
    tabBeautifier.classList.replace('tab-inactive', 'tab-active');
    sectionBeautifier.classList.remove('hidden');
  });

  tabFoxpro.addEventListener('click', () => {
    resetTabs();
    tabFoxpro.classList.replace('tab-inactive', 'tab-active');
    sectionFoxpro.classList.remove('hidden');
  });

  tabFoxproBatch.addEventListener('click', () => {
    resetTabs();
    tabFoxproBatch.classList.replace('tab-inactive', 'tab-active');
    sectionFoxproBatch.classList.remove('hidden');
  });

  tabCodeReferences.addEventListener('click', () => {
    resetTabs();
    tabCodeReferences.classList.replace('tab-inactive', 'tab-active');
    sectionCodeReferences.classList.remove('hidden');
  });

  tabCustomizations?.addEventListener('click', () => {
    resetTabs();
    tabCustomizations.classList.replace('tab-inactive', 'tab-active');
    sectionCustomizations.classList.remove('hidden');
  });

  // --- Batch Logic Validation ---

  let batchCompareFiles: FileList | null = null;

  function validateBatch() {
    btnProcessBatch.disabled = !(batchCompareFiles && batchCompareFiles.length > 0);
  }

  compareFilesInput.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      batchCompareFiles = files;
      compareFilesCount.textContent = `${files.length} arquivo(s) carregado(s)`;
      compareFilesCount.classList.remove('hidden');
    } else {
      batchCompareFiles = null;
      compareFilesCount.classList.add('hidden');
    }
    validateBatch();
  });

  const batchConsolidatedCheck = document.getElementById('batch-consolidated-check') as HTMLInputElement;
  batchConsolidatedCheck?.addEventListener('change', () => {
    btnProcessBatch.textContent = batchConsolidatedCheck.checked ? 'Gerar e Baixar HTML Agrupado' : 'Processar e Baixar ZIP';
  });

  btnProcessBatch.addEventListener('click', async () => {
    if (batchCompareFiles) {
      const customPrefix = (document.getElementById('batch-custom-prefix') as HTMLInputElement)?.value || '';
      const isConsolidated = batchConsolidatedCheck?.checked || false;
      await handleBatchProcess(baseHtmlTemplate, batchCompareFiles, customPrefix, isConsolidated, baseConsolidatedHtmlTemplate);
    }
  });

  // --- Text Logic Validation ---
  const btnPreviewText = document.getElementById('btn-preview-text') as HTMLButtonElement;
  const textPreviewContainer = document.getElementById('text-preview-container') as HTMLElement;
  const textPreviewIframe = document.getElementById('text-preview-iframe') as HTMLIFrameElement;
  const textPreviewFilename = document.getElementById('text-preview-filename') as HTMLElement;
  const btnCloseTextPreview = document.getElementById('btn-close-text-preview') as HTMLButtonElement;

  function validateText() {
    const hasOriginal = textOriginal.value.trim().length > 0;
    const hasModified = textModified.value.trim().length > 0;
    const isValid = hasOriginal && hasModified;
    
    btnProcessText.disabled = !isValid;
    if (btnPreviewText) {
      btnPreviewText.disabled = !isValid;
    }
  }

  textOriginal.addEventListener('input', validateText);
  textModified.addEventListener('input', validateText);

  btnPreviewText?.addEventListener('click', () => {
    const originalText = textOriginal.value;
    const modifiedText = textModified.value;
    const fileNameInput = (document.getElementById('text-file-name') as HTMLInputElement).value;
    const fileName = fileNameInput.trim() || 'COMPARACAO_TEXTO';

    const finalHtml = generateDiffHtml(originalText, modifiedText, baseHtmlTemplate, fileName);

    if (textPreviewFilename) {
      textPreviewFilename.textContent = fileName;
    }
    if (textPreviewContainer) {
      textPreviewContainer.classList.remove('hidden');
    }
    if (textPreviewIframe) {
      textPreviewIframe.srcdoc = finalHtml;
    }

    textPreviewContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  btnCloseTextPreview?.addEventListener('click', () => {
    if (textPreviewContainer) {
      textPreviewContainer.classList.add('hidden');
    }
    if (textPreviewIframe) {
      textPreviewIframe.srcdoc = '';
    }
  });

  btnProcessText.addEventListener('click', async () => {
      await handleTextProcess(
          textOriginal.value, 
          textModified.value, 
          baseHtmlTemplate, 
          (document.getElementById('text-file-name') as HTMLInputElement).value
      );
  });

  // --- FoxPro Single Logic Validation ---
  function validateFoxPro() {
    btnProcessFoxpro.disabled = !(foxAntesFilesInput.files && foxAntesFilesInput.files.length >= 1 && foxDepoisFilesInput.files && foxDepoisFilesInput.files.length >= 1);
  }

  foxAntesFilesInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length >= 1) {
          foxAntesCount.textContent = `${files.length} arquivos carregados`;
          foxAntesCount.classList.remove('hidden');
      } else {
          foxAntesCount.classList.add('hidden');
      }
      validateFoxPro();
  });

  foxDepoisFilesInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length >= 1) {
          foxDepoisCount.textContent = `${files.length} arquivos carregados`;
          foxDepoisCount.classList.remove('hidden');
      } else {
          foxDepoisCount.classList.add('hidden');
      }
      validateFoxPro();
  });

  btnProcessFoxpro.addEventListener('click', async () => {
      const antesFiles = foxAntesFilesInput.files;
      const depoisFiles = foxDepoisFilesInput.files;

      if (!antesFiles || antesFiles.length < 1 || !depoisFiles || depoisFiles.length < 1) return;

      const getBuffers = async (files: FileList) => {
          let bin1: ArrayBuffer | null = null;
          let bin2: ArrayBuffer | null = null;
          let prgText: string | null = null;
          let fileName = '';

          for (let i = 0; i < files.length; i++) {
              const nameLower = files[i].name.toLowerCase();
              if (nameLower.endsWith('.scx') || nameLower.endsWith('.frx')) {
                  bin1 = await files[i].arrayBuffer();
                  fileName = files[i].name.replace(/\.(scx|frx)$/i, '');
              } else if (nameLower.endsWith('.sct') || nameLower.endsWith('.frt')) {
                  bin2 = await files[i].arrayBuffer();
              } else if (nameLower.endsWith('.prg')) {
                  const prgBuffer = await files[i].arrayBuffer();
                  const decoder = new TextDecoder('windows-1252');
                  prgText = decoder.decode(prgBuffer);
                  fileName = files[i].name.replace(/\.prg$/i, '');
              }
          }
          return { bin1, bin2, prgText, fileName };
      };

      try {
          const antes = await getBuffers(antesFiles);
          const depois = await getBuffers(depoisFiles);

          const finalName = foxFileName.value.trim() || antes.fileName || 'ARQUIVO_COMPARADO';
          let antesText = '';
          let depoisText = '';

          if (antes.prgText !== null && depois.prgText !== null) {
              const parser = new FoxProParser();
              antesText = parser.parsePrg(antes.prgText);
              depoisText = parser.parsePrg(depois.prgText);
          } else if (antes.bin1 && antes.bin2 && depois.bin1 && depois.bin2) {
              const parser = new FoxProParser();
              antesText = parser.parse(antes.bin1, antes.bin2);
              depoisText = parser.parse(depois.bin1, depois.bin2);
          } else {
              alert('Por favor, selecione arquivos válidos (.PRG) ou o par correto de binários (.SCX/.SCT ou .FRX/.FRT) para ambas as versões.');
              return;
          }

          await handleTextProcess(antesText, depoisText, baseHtmlTemplate, finalName);
          alert('Comparação concluída e baixada com sucesso!');
      } catch (err) {
          console.error(err);
          alert('Erro ao processar os arquivos.');
      }
  });

  // --- FoxPro Batch Logic Validation ---
  let foxBatchAntesFiles: File[] | FileList | null = null;
  let foxBatchDepoisFiles: File[] | FileList | null = null;

  function validateFoxProBatch() {
    btnProcessFoxproBatch.disabled = !(foxBatchAntesFiles && foxBatchAntesFiles.length > 0 && foxBatchDepoisFiles && foxBatchDepoisFiles.length > 0);
  }

  function getFileMap(files: FileList | File[] | null): FoxProFileMap {
      const map: FoxProFileMap = new Map();
      if (!files) return map;

      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const nameLower = file.name.toLowerCase();
          
          if (nameLower.endsWith('.scx') || nameLower.endsWith('.sct') || 
              nameLower.endsWith('.frx') || nameLower.endsWith('.frt') || 
              nameLower.endsWith('.prg')) {
              
              const baseName = file.name.substring(0, file.name.lastIndexOf('.')).toUpperCase();
              
              const ext = nameLower.substring(nameLower.lastIndexOf('.') + 1);
              let mapKey = '';
              if (ext === 'scx' || ext === 'sct') mapKey = `${baseName}_SCX`;
              else if (ext === 'frx' || ext === 'frt') mapKey = `${baseName}_FRX`;
              else if (ext === 'prg') mapKey = `${baseName}_PRG`;

              let entry = map.get(mapKey);
              if (!entry) {
                  entry = {};
                  map.set(mapKey, entry);
              }
              if (ext === 'scx') entry.scx = file;
              if (ext === 'sct') entry.sct = file;
              if (ext === 'frx') entry.frx = file;
              if (ext === 'frt') entry.frt = file;
              if (ext === 'prg') entry.prg = file;
          }
      }
      return map;
  }

  async function readFilesFromDirectoryHandle(dirHandle: any, path = ''): Promise<File[]> {
      const files: File[] = [];
      for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file') {
              const file = await entry.getFile();
              const relativePath = path ? `${path}/${file.name}` : `${dirHandle.name}/${file.name}`;
              Object.defineProperty(file, 'webkitRelativePath', {
                  value: relativePath,
                  writable: false,
                  configurable: true
              });
              files.push(file);
          } else if (entry.kind === 'directory') {
              const subFiles = await readFilesFromDirectoryHandle(entry, path ? `${path}/${entry.name}` : `${dirHandle.name}/${entry.name}`);
              files.push(...subFiles);
          }
      }
      return files;
  }

  // Bind Native Directory Picker with separate location memory per ID
  const foxBatchAntesLabel = foxBatchAntesDirInput.closest('label');
  if (foxBatchAntesLabel && 'showDirectoryPicker' in window) {
      foxBatchAntesLabel.addEventListener('click', async (e) => {
          e.preventDefault();
          try {
              const handle = await (window as any).showDirectoryPicker({ id: 'fox_batch_antes_directory' });
              const files = await readFilesFromDirectoryHandle(handle);
              foxBatchAntesFiles = files;
              const map = getFileMap(files);
              foxBatchAntesCount.textContent = `${map.size} formulários encontrados`;
              foxBatchAntesCount.classList.remove('hidden');
              validateFoxProBatch();
          } catch (err: any) {
              if (err.name !== 'AbortError') console.error(err);
          }
      });
  }

  foxBatchAntesDirInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
          foxBatchAntesFiles = files;
          const map = getFileMap(files);
          foxBatchAntesCount.textContent = `${map.size} formulários encontrados`;
          foxBatchAntesCount.classList.remove('hidden');
      } else {
          foxBatchAntesCount.classList.add('hidden');
      }
      validateFoxProBatch();
  });

  const foxBatchDepoisLabel = foxBatchDepoisDirInput.closest('label');
  if (foxBatchDepoisLabel && 'showDirectoryPicker' in window) {
      foxBatchDepoisLabel.addEventListener('click', async (e) => {
          e.preventDefault();
          try {
              const handle = await (window as any).showDirectoryPicker({ id: 'fox_batch_depois_directory' });
              const files = await readFilesFromDirectoryHandle(handle);
              foxBatchDepoisFiles = files;
              const map = getFileMap(files);
              foxBatchDepoisCount.textContent = `${map.size} formulários encontrados`;
              foxBatchDepoisCount.classList.remove('hidden');
              validateFoxProBatch();
          } catch (err: any) {
              if (err.name !== 'AbortError') console.error(err);
          }
      });
  }

  foxBatchDepoisDirInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
          foxBatchDepoisFiles = files;
          const map = getFileMap(files);
          foxBatchDepoisCount.textContent = `${map.size} formulários encontrados`;
          foxBatchDepoisCount.classList.remove('hidden');
      } else {
          foxBatchDepoisCount.classList.add('hidden');
      }
      validateFoxProBatch();
  });
  validateFoxProBatch();
  validateFoxPro();

  const foxBatchConsolidatedCheck = document.getElementById('fox-batch-consolidated-check') as HTMLInputElement;
  foxBatchConsolidatedCheck?.addEventListener('change', () => {
    btnProcessFoxproBatch.textContent = foxBatchConsolidatedCheck.checked ? 'Comparar Lote e Baixar HTML Agrupado' : 'Comparar Lote e Baixar ZIP';
  });

  let currentFoxBatchResults: import('./batchProcessor.ts').BatchResultItem[] = [];
  let currentFoxBatchFilter: string = 'all';

  function renderFoxBatchItemsList() {
      const itemsListContainer = document.getElementById('foxpro-batch-items-list');
      if (!itemsListContainer) return;

      itemsListContainer.innerHTML = '';
      
      const filtered = currentFoxBatchFilter === 'all' 
          ? currentFoxBatchResults 
          : currentFoxBatchResults.filter(item => item.category === currentFoxBatchFilter);

      if (filtered.length === 0) {
          itemsListContainer.innerHTML = `<div class="p-4 text-center text-gray-500 text-sm">Nenhum item nesta categoria.</div>`;
          return;
      }

      filtered.forEach(item => {
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-sm';
          
          let badgeHtml = '';
          if (item.category === 'changed') {
              badgeHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">🟢 Com Alteração</span>`;
          } else if (item.category === 'unchanged') {
              badgeHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">⚪ Sem Alteração (Idêntico)</span>`;
          } else if (item.category === 'new') {
              badgeHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">🟡 Novo (Apenas Depois)</span>`;
          } else if (item.category === 'missing') {
              badgeHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">🟣 Ausente (Apenas Antes)</span>`;
          } else {
              badgeHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">🔴 Erro</span>`;
          }

          row.innerHTML = `
              <div class="flex items-center space-x-3">
                  <span class="font-bold text-gray-800">${item.name}</span>
                  <span class="text-xs text-gray-400">(${item.mapKey.replace(/.*_/, '')})</span>
                  <span class="text-xs text-gray-600">${item.message}</span>
              </div>
              <div>${badgeHtml}</div>
          `;
          itemsListContainer.appendChild(row);
      });
  }

  function updateFilterButtonsUI() {
      const filterBtns = document.querySelectorAll('.fox-batch-filter-btn');
      filterBtns.forEach(btn => {
          const cat = (btn as HTMLElement).dataset.category;
          if (cat === currentFoxBatchFilter) {
              btn.className = 'fox-batch-filter-btn bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors';
          } else {
              btn.className = 'fox-batch-filter-btn bg-gray-200 text-gray-700 hover:bg-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors';
          }
      });
  }

  function renderFoxBatchDashboard(results: import('./batchProcessor.ts').BatchResultItem[]) {
      currentFoxBatchResults = results;

      const changedCount = results.filter(r => r.category === 'changed').length;
      const unchangedCount = results.filter(r => r.category === 'unchanged').length;
      const newCount = results.filter(r => r.category === 'new').length;
      const missingCount = results.filter(r => r.category === 'missing').length;
      const errorCount = results.filter(r => r.category === 'error').length;

      const elChanged = document.getElementById('fox-count-changed');
      const elUnchanged = document.getElementById('fox-count-unchanged');
      const elNew = document.getElementById('fox-count-new');
      const elMissing = document.getElementById('fox-count-missing');
      const elError = document.getElementById('fox-count-error');

      if (elChanged) elChanged.textContent = changedCount.toString();
      if (elUnchanged) elUnchanged.textContent = unchangedCount.toString();
      if (elNew) elNew.textContent = newCount.toString();
      if (elMissing) elMissing.textContent = missingCount.toString();
      if (elError) elError.textContent = errorCount.toString();

      const elFilterAll = document.getElementById('fox-filter-count-all');
      const elFilterChanged = document.getElementById('fox-filter-count-changed');
      const elFilterUnchanged = document.getElementById('fox-filter-count-unchanged');
      const elFilterNew = document.getElementById('fox-filter-count-new');
      const elFilterMissing = document.getElementById('fox-filter-count-missing');
      const elFilterError = document.getElementById('fox-filter-count-error');

      if (elFilterAll) elFilterAll.textContent = results.length.toString();
      if (elFilterChanged) elFilterChanged.textContent = changedCount.toString();
      if (elFilterUnchanged) elFilterUnchanged.textContent = unchangedCount.toString();
      if (elFilterNew) elFilterNew.textContent = newCount.toString();
      if (elFilterMissing) elFilterMissing.textContent = missingCount.toString();
      if (elFilterError) elFilterError.textContent = errorCount.toString();

      const summaryContainer = document.getElementById('foxpro-batch-summary');
      if (summaryContainer) {
          summaryContainer.classList.remove('hidden');
      }

      currentFoxBatchFilter = 'all';
      updateFilterButtonsUI();
      renderFoxBatchItemsList();
  }

  const filterContainer = document.getElementById('fox-batch-filter-container');
  if (filterContainer) {
      filterContainer.addEventListener('click', (e) => {
          const target = (e.target as HTMLElement).closest('.fox-batch-filter-btn') as HTMLElement;
          if (target && target.dataset.category) {
              currentFoxBatchFilter = target.dataset.category;
              updateFilterButtonsUI();
              renderFoxBatchItemsList();
          }
      });
  }

  const cardMap: Array<[string, string]> = [
      ['fox-card-changed', 'changed'],
      ['fox-card-unchanged', 'unchanged'],
      ['fox-card-new', 'new'],
      ['fox-card-missing', 'missing'],
      ['fox-card-error', 'error']
  ];
  cardMap.forEach(([cardId, cat]) => {
      const cardEl = document.getElementById(cardId);
      if (cardEl) {
          cardEl.addEventListener('click', () => {
              currentFoxBatchFilter = cat;
              updateFilterButtonsUI();
              renderFoxBatchItemsList();
          });
      }
  });

  btnProcessFoxproBatch.addEventListener('click', async () => {
      const antesFiles = foxBatchAntesFiles;
      const depoisFiles = foxBatchDepoisFiles;

      if (!antesFiles || !depoisFiles) return;

      const antesMap = getFileMap(antesFiles);
      const depoisMap = getFileMap(depoisFiles);

      const checkMissingInput = document.getElementById('fox-batch-check-missing') as HTMLInputElement;
      const checkMissing = checkMissingInput?.checked || false;

      const customPrefixInput = document.getElementById('fox-batch-custom-prefix') as HTMLInputElement;
      const customPrefix = customPrefixInput?.value || '';

      const foxBatchConsolidatedCheck = document.getElementById('fox-batch-consolidated-check') as HTMLInputElement;
      const isConsolidated = foxBatchConsolidatedCheck?.checked || false;

      foxBatchConsolidatedCheck?.addEventListener('change', () => {
        btnProcessFoxproBatch.textContent = foxBatchConsolidatedCheck.checked ? 'Comparar Lote e Baixar HTML Agrupado' : 'Comparar Lote e Baixar ZIP';
      });

      const parser = new FoxProParser();
      btnProcessFoxproBatch.disabled = true;
      btnProcessFoxproBatch.textContent = 'Processando...';

      const results = await handleFoxProBatchProcess(antesMap, depoisMap, baseHtmlTemplate, parser, checkMissing, customPrefix, isConsolidated, baseConsolidatedHtmlTemplate);
      renderFoxBatchDashboard(results);

      btnProcessFoxproBatch.disabled = false;
      btnProcessFoxproBatch.textContent = isConsolidated ? 'Comparar Lote e Baixar HTML Agrupado' : 'Comparar Lote e Baixar ZIP';
  });

  // --- Code References Logic ---
  const crFolderInput = document.getElementById('cr-folder-input') as HTMLInputElement;
  const crFolderCount = document.getElementById('cr-folder-count') as HTMLElement;
  const crRootPathInput = document.getElementById('cr-root-path') as HTMLInputElement;
  const crSearchTerm = document.getElementById('cr-search-term') as HTMLInputElement;
  const btnCrAddTerm = document.getElementById('btn-cr-add-term') as HTMLButtonElement;
  const crSearchTags = document.getElementById('cr-search-tags') as HTMLElement;
  
  const crMatchExact = document.getElementById('cr-match-exact') as HTMLInputElement;
  const crMatchCase = document.getElementById('cr-match-case') as HTMLInputElement;
  const crMatchSameMethod = document.getElementById('cr-match-same-method') as HTMLInputElement;
  const crIgnoreSpaces = document.getElementById('cr-ignore-spaces') as HTMLInputElement;
  const btnProcessCr = document.getElementById('btn-process-cr') as HTMLButtonElement;
  const crResultsContainer = document.getElementById('cr-results-container') as HTMLElement;
  const crResultsStats = document.getElementById('cr-results-stats') as HTMLElement;
  const crTreeView = document.getElementById('cr-tree-view') as HTMLElement;

  // Restaurar e persistir caminho raiz local (Padrão: C:\TestesVF)
  if (crRootPathInput) {
      const savedRoot = localStorage.getItem('crRootPath');
      if (savedRoot !== null && savedRoot.trim().length > 0) {
          crRootPathInput.value = savedRoot;
      } else {
          crRootPathInput.value = 'C:\\TestesVF';
          localStorage.setItem('crRootPath', 'C:\\TestesVF');
      }
      crRootPathInput.addEventListener('input', () => {
          localStorage.setItem('crRootPath', crRootPathInput.value.trim());
      });
  }

  const btnCrExpand = document.getElementById('btn-cr-expand') as HTMLButtonElement;
  const btnCrCollapse = document.getElementById('btn-cr-collapse') as HTMLButtonElement;

  btnCrExpand.addEventListener('click', () => {
      const uls = crTreeView.querySelectorAll('ul.hidden');
      uls.forEach(ul => ul.classList.remove('hidden'));
      const svgs = crTreeView.querySelectorAll('svg');
      svgs.forEach(svg => svg.style.transform = 'rotate(90deg)');
  });

  btnCrCollapse.addEventListener('click', () => {
      // Find all nested ULs (the ones inside LI) and hide them
      const uls = crTreeView.querySelectorAll('li > ul');
      uls.forEach(ul => ul.classList.add('hidden'));
      const svgs = crTreeView.querySelectorAll('svg');
      svgs.forEach(svg => svg.style.transform = 'rotate(0deg)');
  });

  let crFiles: FileList | null = crFolderInput.files && crFolderInput.files.length > 0 ? crFolderInput.files : null;
  const crSearchTermList: string[] = [];

  function renderCrTags() {
      crSearchTags.innerHTML = '';
      crSearchTermList.forEach((term, index) => {
          const tag = document.createElement('span');
          tag.className = 'inline-flex items-center bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded';
          tag.textContent = term;
          
          const removeBtn = document.createElement('button');
          removeBtn.className = 'ml-1 text-blue-600 hover:text-blue-900 focus:outline-none';
          removeBtn.innerHTML = '&times;';
          removeBtn.addEventListener('click', () => {
              crSearchTermList.splice(index, 1);
              renderCrTags();
              validateCr();
          });
          
          tag.appendChild(removeBtn);
          crSearchTags.appendChild(tag);
      });
  }

  function addCrTerm() {
      const val = crSearchTerm.value.trim();
      if (val) {
          if (!crSearchTermList.includes(val)) {
              crSearchTermList.push(val);
          }
          crSearchTerm.value = '';
          renderCrTags();
          validateCr();
      }
  }

  btnCrAddTerm.addEventListener('click', addCrTerm);
  crSearchTerm.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          addCrTerm();
      }
  });

  function validateCr() {
      btnProcessCr.disabled = !(crFiles && crFiles.length > 0 && crSearchTermList.length > 0);
  }

  crFolderInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
          crFiles = files;
          crFolderCount.textContent = `${files.length} arquivos encontrados na pasta`;
          crFolderCount.classList.remove('hidden');
      } else {
          crFiles = null;
          crFolderCount.classList.add('hidden');
      }
      validateCr();
  });

  // crSearchTerm validation is no longer needed on input, we only validate the tags list.

  btnProcessCr.addEventListener('click', async () => {
      if (!crFiles) return;
      
      btnProcessCr.disabled = true;
      const originalText = btnProcessCr.textContent;
      btnProcessCr.textContent = 'Pesquisando...';
      
      crResultsContainer.classList.remove('hidden');
      crResultsStats.textContent = 'Lendo arquivos e buscando...';
      crTreeView.innerHTML = '<div class="p-4 text-gray-500 text-center">Processando...</div>';

      try {
          const results = await handleCodeReferencesSearch(
              crFiles,
              crSearchTermList,
              crMatchExact.checked,
              crMatchCase.checked,
              crMatchSameMethod.checked,
              crIgnoreSpaces ? crIgnoreSpaces.checked : false,
              (msg) => {
                  crResultsStats.textContent = msg;
              }
          );
          
          crResultsStats.textContent = `Encontrados ${results.length} resultados.`;
          const rootPath = crRootPathInput ? crRootPathInput.value.trim() : '';
          renderTreeResults(results, crTreeView, rootPath);
      } catch (err: any) {
          console.error(err);
          crResultsStats.textContent = 'Erro ao pesquisar.';
          crTreeView.innerHTML = `<div class="p-4 text-red-500 text-center">Erro: ${err.message || err}</div>`;
      } finally {
          btnProcessCr.textContent = originalText;
          validateCr();
      }
  });

  // --- Beautifier / Formatador Logic ---
  const beautifierType = document.getElementById('beautifier-type') as HTMLSelectElement;
  const beautifierIndent = document.getElementById('beautifier-indent') as HTMLSelectElement;
  const beautifierInput = document.getElementById('beautifier-input') as HTMLTextAreaElement;
  const beautifierOutput = document.getElementById('beautifier-output') as HTMLTextAreaElement;
  const beautifierStatus = document.getElementById('beautifier-status') as HTMLElement;
  const beautifierStatusText = document.getElementById('beautifier-status-text') as HTMLElement;
  const beautifierDetectedBadge = document.getElementById('beautifier-detected-badge') as HTMLElement;
  const beautifierInputStats = document.getElementById('beautifier-input-stats') as HTMLElement;
  const beautifierOutputStats = document.getElementById('beautifier-output-stats') as HTMLElement;

  const btnBeautifierFormat = document.getElementById('btn-beautifier-format') as HTMLButtonElement;
  const btnBeautifierMinify = document.getElementById('btn-beautifier-minify') as HTMLButtonElement;
  const btnBeautifierCopy = document.getElementById('btn-beautifier-copy') as HTMLButtonElement;
  const btnBeautifierDownload = document.getElementById('btn-beautifier-download') as HTMLButtonElement;
  const btnBeautifierClear = document.getElementById('btn-beautifier-clear') as HTMLButtonElement;

  const btnFormatOriginal = document.getElementById('btn-format-original') as HTMLButtonElement;
  const btnFormatModified = document.getElementById('btn-format-modified') as HTMLButtonElement;

  function calcStats(text: string): string {
    if (!text) return '0 lin | 0 car';
    const lines = text.split('\n').length;
    const chars = text.length;
    return `${lines} lin | ${chars} car`;
  }

  function runBeautify() {
    const text = beautifierInput.value;
    const targetType = beautifierType.value as 'auto' | 'json' | 'xml' | 'sql';
    const indent = beautifierIndent.value;

    if (!text.trim()) {
      beautifierOutput.value = '';
      beautifierStatus.classList.add('hidden');
      beautifierInputStats.textContent = '0 lin | 0 car';
      beautifierOutputStats.textContent = '0 lin | 0 car';
      return;
    }

    const res = beautifyText(text, targetType, indent);
    beautifierOutput.value = res.formatted;

    beautifierInputStats.textContent = calcStats(text);
    beautifierOutputStats.textContent = calcStats(res.formatted);

    beautifierStatus.classList.remove('hidden');
    beautifierDetectedBadge.textContent = res.detectedType.toUpperCase();

    if (res.error) {
      beautifierStatus.className = 'mb-4 p-3 rounded-lg text-sm border font-medium flex items-center justify-between bg-red-50 text-red-700 border-red-200';
      beautifierStatusText.textContent = res.error;
    } else {
      beautifierStatus.className = 'mb-4 p-3 rounded-lg text-sm border font-medium flex items-center justify-between bg-green-50 text-green-700 border-green-200';
      beautifierStatusText.textContent = '✓ Texto formatado com sucesso!';
    }
  }

  function runMinify() {
    const text = beautifierInput.value;
    const targetType = beautifierType.value as any;

    if (!text.trim()) return;

    const res = minifyText(text, targetType);
    beautifierOutput.value = res.formatted;

    beautifierInputStats.textContent = calcStats(text);
    beautifierOutputStats.textContent = calcStats(res.formatted);

    beautifierStatus.classList.remove('hidden');
    beautifierDetectedBadge.textContent = res.detectedType.toUpperCase();

    if (res.error) {
      beautifierStatus.className = 'mb-4 p-3 rounded-lg text-sm border font-medium flex items-center justify-between bg-red-50 text-red-700 border-red-200';
      beautifierStatusText.textContent = res.error;
    } else {
      beautifierStatus.className = 'mb-4 p-3 rounded-lg text-sm border font-medium flex items-center justify-between bg-amber-50 text-amber-800 border-amber-200';
      beautifierStatusText.textContent = '⚡ Texto minificado com sucesso!';
    }
  }

  beautifierInput?.addEventListener('input', () => {
    beautifierInputStats.textContent = calcStats(beautifierInput.value);
  });

  btnBeautifierFormat?.addEventListener('click', runBeautify);
  btnBeautifierMinify?.addEventListener('click', runMinify);

  beautifierType?.addEventListener('change', () => {
    if (beautifierInput.value.trim()) runBeautify();
  });

  beautifierIndent?.addEventListener('change', () => {
    if (beautifierInput.value.trim()) runBeautify();
  });

  btnBeautifierClear?.addEventListener('click', () => {
    beautifierInput.value = '';
    beautifierOutput.value = '';
    beautifierStatus.classList.add('hidden');
    beautifierInputStats.textContent = '0 lin | 0 car';
    beautifierOutputStats.textContent = '0 lin | 0 car';
  });

  btnBeautifierCopy?.addEventListener('click', () => {
    if (!beautifierOutput.value) return;
    navigator.clipboard.writeText(beautifierOutput.value).then(() => {
      const orig = btnBeautifierCopy.innerHTML;
      btnBeautifierCopy.innerHTML = '✓ Copiado!';
      setTimeout(() => { btnBeautifierCopy.innerHTML = orig; }, 2000);
    });
  });

  btnBeautifierDownload?.addEventListener('click', () => {
    if (!beautifierOutput.value) return;
    const content = beautifierOutput.value;
    const detected = (beautifierDetectedBadge.textContent || '').toLowerCase();
    const ext = detected === 'json' ? 'json' : (detected === 'xml' ? 'xml' : (detected === 'sql' ? 'sql' : 'txt'));
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `texto_formatado.${ext}`);
  });

  // Botões rápidos de formatação na aba de Comparação de Texto
  btnFormatOriginal?.addEventListener('click', () => {
    const text = textOriginal.value;
    if (!text.trim()) return;
    const res = beautifyText(text, 'auto', 2);
    if (res.error) {
      alert(res.error);
    } else {
      textOriginal.value = res.formatted;
      textOriginal.dispatchEvent(new Event('input'));
    }
  });

  btnFormatModified?.addEventListener('click', () => {
    const text = textModified.value;
    if (!text.trim()) return;
    const res = beautifyText(text, 'auto', 2);
    if (res.error) {
      alert(res.error);
    } else {
      textModified.value = res.formatted;
      textModified.dispatchEvent(new Event('input'));
    }
  });

  // --- Analisar Customizações Logic ---
  const customFolderInput = document.getElementById('custom-folder-input') as HTMLInputElement;
  const customFolderCount = document.getElementById('custom-folder-count') as HTMLElement;
  const customProgressContainer = document.getElementById('custom-progress-container') as HTMLElement;
  const customProgressMessage = document.getElementById('custom-progress-message') as HTMLElement;
  const customProgressPercent = document.getElementById('custom-progress-percent') as HTMLElement;
  const customProgressBar = document.getElementById('custom-progress-bar') as HTMLElement;
  const customResultsContainer = document.getElementById('custom-results-container') as HTMLElement;

  const customStatTotal = document.getElementById('custom-stat-total') as HTMLElement;
  const customStatChanged = document.getElementById('custom-stat-changed') as HTMLElement;
  const customStatUnchanged = document.getElementById('custom-stat-unchanged') as HTMLElement;
  const customStatForms = document.getElementById('custom-stat-forms') as HTMLElement;
  const customStatPrgs = document.getElementById('custom-stat-prgs') as HTMLElement;
  const customStatReports = document.getElementById('custom-stat-reports') as HTMLElement;

  const cntFilterAll = document.getElementById('cnt-filter-all') as HTMLElement;
  const cntFilterChanged = document.getElementById('cnt-filter-changed') as HTMLElement;
  const cntFilterUnchanged = document.getElementById('cnt-filter-unchanged') as HTMLElement;
  const cntFilterForms = document.getElementById('cnt-filter-forms') as HTMLElement;
  const cntFilterPrgs = document.getElementById('cnt-filter-prgs') as HTMLElement;
  const cntFilterReports = document.getElementById('cnt-filter-reports') as HTMLElement;

  const customItemsTbody = document.getElementById('custom-items-tbody') as HTMLTableSectionElement;
  const customSearchInput = document.getElementById('custom-search-input') as HTMLInputElement;

  const customDiffModal = document.getElementById('custom-diff-modal') as HTMLElement;
  const customModalTitle = document.getElementById('custom-modal-title') as HTMLElement;
  const customModalSubtitle = document.getElementById('custom-modal-subtitle') as HTMLElement;
  const customModalIframe = document.getElementById('custom-modal-iframe') as HTMLIFrameElement;
  const btnCloseCustomModal = document.getElementById('btn-close-custom-modal') as HTMLButtonElement;
  const btnDownloadCustomModal = document.getElementById('btn-download-custom-modal') as HTMLButtonElement;

  let activeSummary: AnalysisSummary | null = null;
  let activeFilter: string = 'all';
  let activeSearchTerm: string = '';
  let activeModalItem: CustomizedItem | null = null;

  customFolderInput?.addEventListener('change', async (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    if (customFolderCount) {
      customFolderCount.textContent = `${files.length.toLocaleString()} arquivos carregados do repositório`;
      customFolderCount.classList.remove('hidden');
    }

    if (customProgressContainer) customProgressContainer.classList.remove('hidden');
    if (customResultsContainer) customResultsContainer.classList.add('hidden');

    if (customProgressMessage) customProgressMessage.textContent = 'Carregando arquivos do repositório...';
    if (customProgressPercent) customProgressPercent.textContent = '0%';
    if (customProgressBar) customProgressBar.style.width = '0%';

    // Yield para garantir a renderização imediata do container de carregamento no navegador
    await new Promise(r => setTimeout(r, 50));

    try {
      activeSummary = await analyzeRepositoryCustomizations(files, (msg, percent) => {
        if (customProgressMessage) customProgressMessage.textContent = msg;
        if (percent !== undefined) {
          if (customProgressPercent) customProgressPercent.textContent = `${percent}%`;
          if (customProgressBar) customProgressBar.style.width = `${percent}%`;
        }
      });

      renderCustomSummary(activeSummary);
      if (customResultsContainer) customResultsContainer.classList.remove('hidden');
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao analisar repositório: ${err?.message || err}`);
    } finally {
      if (customProgressContainer) customProgressContainer.classList.add('hidden');
    }
  });

  function renderCustomSummary(summary: AnalysisSummary) {
    if (customStatTotal) customStatTotal.textContent = summary.totalCustomizations.toString();
    if (customStatChanged) customStatChanged.textContent = summary.hasChangesCount.toString();
    if (customStatUnchanged) customStatUnchanged.textContent = summary.noChangesCount.toString();
    if (customStatForms) customStatForms.textContent = summary.formCount.toString();
    if (customStatPrgs) customStatPrgs.textContent = summary.prgCount.toString();
    if (customStatReports) customStatReports.textContent = summary.reportCount.toString();

    if (cntFilterAll) cntFilterAll.textContent = summary.totalCustomizations.toString();
    if (cntFilterChanged) cntFilterChanged.textContent = summary.hasChangesCount.toString();
    if (cntFilterUnchanged) cntFilterUnchanged.textContent = summary.noChangesCount.toString();
    if (cntFilterForms) cntFilterForms.textContent = summary.formCount.toString();
    if (cntFilterPrgs) cntFilterPrgs.textContent = summary.prgCount.toString();
    if (cntFilterReports) cntFilterReports.textContent = summary.reportCount.toString();

    renderCustomItemsTable();
  }

  function renderCustomItemsTable() {
    if (!activeSummary || !customItemsTbody) return;

    const filtered = activeSummary.items.filter(item => {
      // Filtro por categoria / status
      if (activeFilter === 'changed' && !item.hasChanges) return false;
      if (activeFilter === 'unchanged' && item.hasChanges) return false;
      if (activeFilter === 'form' && item.category !== 'FORM') return false;
      if (activeFilter === 'prg' && item.category !== 'PRG') return false;
      if (activeFilter === 'report' && item.category !== 'REPORT') return false;

      // Filtro por texto de busca
      if (activeSearchTerm.trim()) {
        const term = activeSearchTerm.toLowerCase();
        const matchName = item.name.toLowerCase().includes(term);
        const matchCustomPath = item.relativePathCustom.toLowerCase().includes(term);
        const matchStdPath = item.relativePathStandard.toLowerCase().includes(term);
        if (!matchName && !matchCustomPath && !matchStdPath) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      customItemsTbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-8 text-center text-gray-500 italic">
            Nenhuma customização encontrada para os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    customItemsTbody.innerHTML = filtered.map(item => {
      let categoryBadge = '';
      if (item.category === 'FORM') {
        categoryBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">FORM</span>`;
      } else if (item.category === 'PRG') {
        categoryBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-teal-100 text-teal-800">PRG</span>`;
      } else if (item.category === 'REPORT') {
        categoryBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">REPORT</span>`;
      } else {
        categoryBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-800">OUTRO</span>`;
      }

      let statusBadge = '';
      if (item.error) {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">Erro</span>`;
      } else if (item.hasChanges) {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">Com Alteração</span>`;
      } else {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">Sem Alteração</span>`;
      }

      return `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-3 whitespace-nowrap">${categoryBadge}</td>
          <td class="px-4 py-3 font-bold text-gray-800 whitespace-nowrap">${item.name}</td>
          <td class="px-4 py-3 text-xs text-gray-600 font-mono">${item.relativePathCustom}</td>
          <td class="px-4 py-3 text-xs text-gray-500 font-mono">${item.relativePathStandard}</td>
          <td class="px-4 py-3 text-center whitespace-nowrap">${statusBadge}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap space-x-2">
            <button type="button" class="btn-view-custom-diff bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs py-1.5 px-3 rounded-lg shadow transition-colors" data-id="${item.id}">
              Ver Alterações
            </button>
            <button type="button" class="btn-download-custom-diff bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs py-1.5 px-2.5 rounded-lg border border-gray-300 transition-colors" data-id="${item.id}" title="Baixar HTML da comparação">
              📥
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Event listeners dos botões da tabela
    customItemsTbody.querySelectorAll('.btn-view-custom-diff').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        openCustomDiffModal(id);
      });
    });

    customItemsTbody.querySelectorAll('.btn-download-custom-diff').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        downloadCustomDiffHtml(id);
      });
    });
  }

  // Event Listeners dos cards de métricas para aplicar filtros rápidos
  document.getElementById('custom-card-total')?.addEventListener('click', () => setCustomFilter('all'));
  document.getElementById('custom-card-changed')?.addEventListener('click', () => setCustomFilter('changed'));
  document.getElementById('custom-card-unchanged')?.addEventListener('click', () => setCustomFilter('unchanged'));
  document.getElementById('custom-card-forms')?.addEventListener('click', () => setCustomFilter('form'));
  document.getElementById('custom-card-prgs')?.addEventListener('click', () => setCustomFilter('prg'));
  document.getElementById('custom-card-reports')?.addEventListener('click', () => setCustomFilter('report'));

  // Event Listeners dos botões de filtro
  document.querySelectorAll('.custom-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = (e.currentTarget as HTMLElement).getAttribute('data-filter');
      if (filter) setCustomFilter(filter);
    });
  });

  function setCustomFilter(filter: string) {
    activeFilter = filter;
    document.querySelectorAll('.custom-filter-btn').forEach(btn => {
      const btnFilter = btn.getAttribute('data-filter');
      if (btnFilter === filter) {
        btn.classList.replace('bg-gray-200', 'bg-blue-700');
        btn.classList.replace('text-gray-700', 'text-white');
      } else {
        btn.classList.replace('bg-blue-700', 'bg-gray-200');
        btn.classList.replace('text-white', 'text-gray-700');
      }
    });
    renderCustomItemsTable();
  }

  customSearchInput?.addEventListener('input', (e) => {
    activeSearchTerm = (e.target as HTMLInputElement).value;
    renderCustomItemsTable();
  });

  function openCustomDiffModal(itemId: string | null) {
    if (!activeSummary || !itemId) return;
    const item = activeSummary.items.find(i => i.id === itemId);
    if (!item) return;

    activeModalItem = item;
    const stdText = item.standardText || '';
    const custText = item.customText || '';

    const htmlContent = generateDiffHtml(stdText, custText, baseHtmlTemplate, item.name, 'CUSTOMIZADO');

    if (customModalTitle) customModalTitle.textContent = `Customização: ${item.name} (${item.category})`;
    if (customModalSubtitle) customModalSubtitle.textContent = `${item.relativePathCustom} vs ${item.relativePathStandard}`;
    if (customModalIframe) customModalIframe.srcdoc = htmlContent;

    if (customDiffModal) customDiffModal.classList.remove('hidden');
  }

  function downloadCustomDiffHtml(itemId: string | null) {
    if (!activeSummary || !itemId) return;
    const item = activeSummary.items.find(i => i.id === itemId);
    if (!item) return;

    const stdText = item.standardText || '';
    const custText = item.customText || '';
    handleTextProcess(stdText, custText, baseHtmlTemplate, item.name, 'CUSTOMIZADO');
  }

  btnCloseCustomModal?.addEventListener('click', () => {
    if (customDiffModal) customDiffModal.classList.add('hidden');
    if (customModalIframe) customModalIframe.srcdoc = '';
    activeModalItem = null;
  });

  btnDownloadCustomModal?.addEventListener('click', () => {
    if (activeModalItem) {
      downloadCustomDiffHtml(activeModalItem.id);
    }
  });

});
