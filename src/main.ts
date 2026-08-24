import { handleBatchProcess } from './batchProcessor.ts';
import { handleFoxProBatchProcess, type FoxProFileMap } from './batchProcessor.ts';
import { handleTextProcess, generateDiffHtml } from './textComparator.ts';
import { FoxProParser } from './foxproParser.ts';
import { handleCodeReferencesSearch, renderTreeResults } from './codeReferences.ts';
import { beautifyText, minifyText } from './beautifier.ts';
import { analyzeRepositoryCustomizations, type AnalysisSummary, type CustomizedItem } from './customizationAnalyzer.ts';
import { validateSingleXml, validateBatchXml, SCHEMA_PACKAGES, type FileValidationResult } from './xmlValidator.ts';
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
  const tabXmlValidator = document.getElementById('tab-xml-validator') as HTMLButtonElement;

  const sectionBatch = document.getElementById('section-batch') as HTMLElement;
  const sectionText = document.getElementById('section-text') as HTMLElement;
  const sectionBeautifier = document.getElementById('section-beautifier') as HTMLElement;
  const sectionFoxpro = document.getElementById('section-foxpro') as HTMLElement;
  const sectionFoxproBatch = document.getElementById('section-foxpro-batch') as HTMLElement;
  const sectionCodeReferences = document.getElementById('section-code-references') as HTMLElement;
  const sectionCustomizations = document.getElementById('section-customizations') as HTMLElement;
  const sectionXmlValidator = document.getElementById('section-xml-validator') as HTMLElement;

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

  // --- Theme Manager (Dark / Light Mode) ---
  const themeToggleBtn = document.getElementById('theme-toggle-btn') as HTMLButtonElement;
  const themeIconSun = document.getElementById('theme-icon-sun') as HTMLElement;
  const themeIconMoon = document.getElementById('theme-icon-moon') as HTMLElement;
  const themeToggleLabel = document.getElementById('theme-toggle-label') as HTMLElement;

  function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    applyTheme(isDark);
  }

  function applyTheme(isDark: boolean) {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      themeIconSun?.classList.remove('hidden');
      themeIconMoon?.classList.add('hidden');
      if (themeToggleLabel) themeToggleLabel.textContent = 'Modo Claro';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      themeIconSun?.classList.add('hidden');
      themeIconMoon?.classList.remove('hidden');
      if (themeToggleLabel) themeToggleLabel.textContent = 'Modo Escuro';
    }
  }

  themeToggleBtn?.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    applyTheme(!isDark);
  });

  initTheme();

  // --- Mobile Sidebar Controls ---
  const appSidebar = document.getElementById('app-sidebar') as HTMLElement;
  const sidebarOpenBtn = document.getElementById('sidebar-open-btn') as HTMLButtonElement;
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn') as HTMLButtonElement;
  const sidebarBackdrop = document.getElementById('sidebar-backdrop') as HTMLElement;

  function closeMobileSidebar() {
    appSidebar?.classList.add('-translate-x-full');
    sidebarBackdrop?.classList.add('hidden');
  }

  function openMobileSidebar() {
    appSidebar?.classList.remove('-translate-x-full');
    sidebarBackdrop?.classList.remove('hidden');
  }

  sidebarOpenBtn?.addEventListener('click', openMobileSidebar);
  sidebarCloseBtn?.addEventListener('click', closeMobileSidebar);
  sidebarBackdrop?.addEventListener('click', closeMobileSidebar);

  // --- Tab Logic ---
  function resetTabs() {
    [tabBatch, tabText, tabBeautifier, tabFoxpro, tabFoxproBatch, tabCodeReferences, tabCustomizations, tabXmlValidator].forEach(t => {
      t?.classList.remove('tab-active');
      t?.classList.add('tab-inactive');
    });
    [sectionBatch, sectionText, sectionBeautifier, sectionFoxpro, sectionFoxproBatch, sectionCodeReferences, sectionCustomizations, sectionXmlValidator].forEach(s => s?.classList.add('hidden'));
    closeMobileSidebar();
  }

  tabBatch?.addEventListener('click', () => {
    resetTabs();
    tabBatch.classList.remove('tab-inactive');
    tabBatch.classList.add('tab-active');
    sectionBatch.classList.remove('hidden');
  });

  tabText?.addEventListener('click', () => {
    resetTabs();
    tabText.classList.remove('tab-inactive');
    tabText.classList.add('tab-active');
    sectionText.classList.remove('hidden');
  });

  tabBeautifier?.addEventListener('click', () => {
    resetTabs();
    tabBeautifier.classList.remove('tab-inactive');
    tabBeautifier.classList.add('tab-active');
    sectionBeautifier.classList.remove('hidden');
  });

  tabFoxpro?.addEventListener('click', () => {
    resetTabs();
    tabFoxpro.classList.remove('tab-inactive');
    tabFoxpro.classList.add('tab-active');
    sectionFoxpro.classList.remove('hidden');
  });

  tabFoxproBatch?.addEventListener('click', () => {
    resetTabs();
    tabFoxproBatch.classList.remove('tab-inactive');
    tabFoxproBatch.classList.add('tab-active');
    sectionFoxproBatch.classList.remove('hidden');
  });

  tabCodeReferences?.addEventListener('click', () => {
    resetTabs();
    tabCodeReferences.classList.remove('tab-inactive');
    tabCodeReferences.classList.add('tab-active');
    sectionCodeReferences.classList.remove('hidden');
  });

  tabCustomizations?.addEventListener('click', () => {
    resetTabs();
    tabCustomizations.classList.remove('tab-inactive');
    tabCustomizations.classList.add('tab-active');
    sectionCustomizations.classList.remove('hidden');
  });

  tabXmlValidator?.addEventListener('click', () => {
    resetTabs();
    tabXmlValidator.classList.remove('tab-inactive');
    tabXmlValidator.classList.add('tab-active');
    sectionXmlValidator.classList.remove('hidden');
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
  const crMatchSameLine = document.getElementById('cr-match-same-line') as HTMLInputElement;
  const crIgnoreSpaces = document.getElementById('cr-ignore-spaces') as HTMLInputElement;
  const btnProcessCr = document.getElementById('btn-process-cr') as HTMLButtonElement;
  const crResultsContainer = document.getElementById('cr-results-container') as HTMLElement;
  const crResultsStats = document.getElementById('cr-results-stats') as HTMLElement;
  const crTreeView = document.getElementById('cr-tree-view') as HTMLElement;

  if (crMatchSameLine && crMatchSameMethod) {
      crMatchSameLine.addEventListener('change', () => {
          if (crMatchSameLine.checked) {
              crMatchSameMethod.checked = false;
          }
      });
      crMatchSameMethod.addEventListener('change', () => {
          if (crMatchSameMethod.checked) {
              crMatchSameLine.checked = false;
          }
      });
  }

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
          tag.className = 'inline-flex items-center bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-xs font-medium px-2.5 py-0.5 rounded border border-blue-200 dark:border-blue-700/60';
          tag.textContent = term;
          
          const removeBtn = document.createElement('button');
          removeBtn.className = 'ml-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-100 focus:outline-none font-bold text-sm leading-none';
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
      if (crSearchTerm.value.trim().length > 0) {
          addCrTerm();
      }
      if (!crFiles || crSearchTermList.length === 0) return;
      
      btnProcessCr.disabled = true;
      const originalText = btnProcessCr.textContent;
      btnProcessCr.textContent = 'Pesquisando...';
      
      crResultsContainer.classList.remove('hidden');
      crResultsStats.textContent = 'Lendo arquivos e buscando...';
      crTreeView.innerHTML = '<div class="p-4 text-gray-500 dark:text-slate-400 text-center">Processando...</div>';

      try {
          const results = await handleCodeReferencesSearch(
              crFiles,
              crSearchTermList,
              crMatchExact.checked,
              crMatchCase.checked,
              crMatchSameMethod.checked,
              crMatchSameLine ? crMatchSameLine.checked : false,
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
          crTreeView.innerHTML = `<div class="p-4 text-red-500 dark:text-red-400 text-center">Erro: ${err.message || err}</div>`;
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

  // --- XML Validator Logic ---
  let xmlInputMode: 'text' | 'file' = 'text';
  let loadedXmlFiles: File[] = [];
  let currentValidationResults: FileValidationResult[] = [];

  const xmlModeBtnText = document.getElementById('xml-mode-btn-text') as HTMLButtonElement;
  const xmlModeBtnFile = document.getElementById('xml-mode-btn-file') as HTMLButtonElement;
  const xmlContainerText = document.getElementById('xml-container-text') as HTMLElement;
  const xmlContainerFile = document.getElementById('xml-container-file') as HTMLElement;

  const xmlSchemaCategory = document.getElementById('xml-schema-category') as HTMLSelectElement;
  const xmlSchemaEnvironment = document.getElementById('xml-schema-environment') as HTMLSelectElement;
  const xmlSchemaTarget = document.getElementById('xml-schema-target') as HTMLSelectElement;
  const xmlInputText = document.getElementById('xml-input-text') as HTMLTextAreaElement;
  
  const xmlDropZone = document.getElementById('xml-drop-zone') as HTMLElement;
  const xmlInputFiles = document.getElementById('xml-input-files') as HTMLInputElement;
  const xmlFilesSummary = document.getElementById('xml-files-summary') as HTMLElement;
  const xmlFilesCountBadge = document.getElementById('xml-files-count-badge') as HTMLElement;
  const xmlFilesList = document.getElementById('xml-files-list') as HTMLElement;
  const btnXmlClearFiles = document.getElementById('btn-xml-clear-files') as HTMLButtonElement;

  const btnXmlSampleDps = document.getElementById('btn-xml-sample-dps') as HTMLButtonElement;
  const btnXmlSampleNfse = document.getElementById('btn-xml-sample-nfse') as HTMLButtonElement;
  const btnXmlSampleSpRps = document.getElementById('btn-xml-sample-sp-rps') as HTMLButtonElement;
  const btnXmlSampleNfeSefaz = document.getElementById('btn-xml-sample-nfe-sefaz') as HTMLButtonElement;
  const btnXmlSampleGuarulhos = document.getElementById('btn-xml-sample-guarulhos') as HTMLButtonElement;
  const btnXmlFormat = document.getElementById('btn-xml-format') as HTMLButtonElement;
  const btnXmlClear = document.getElementById('btn-xml-clear') as HTMLButtonElement;

  function populateSchemaCategoryDropdown() {
    if (!xmlSchemaCategory) return;
    const categories = Array.from(new Set(SCHEMA_PACKAGES.map(pkg => pkg.categoryName)));
    xmlSchemaCategory.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    updateEnvironmentDropdown(xmlSchemaCategory.value);
  }

  function updateEnvironmentDropdown(categoryName: string) {
    const pkgs = SCHEMA_PACKAGES.filter(p => p.categoryName === categoryName);
    if (!pkgs.length) return;

    if (xmlSchemaEnvironment) {
      xmlSchemaEnvironment.innerHTML = pkgs.map(pkg => `
        <option value="${pkg.id}">${pkg.environmentName}</option>
      `).join('');
    }

    const selectedPkgId = xmlSchemaEnvironment ? xmlSchemaEnvironment.value : pkgs[0].id;
    updateSchemaTargetDropdown(selectedPkgId);
  }

  function updateSchemaTargetDropdown(packageId: string) {
    const pkg = SCHEMA_PACKAGES.find(p => p.id === packageId) || SCHEMA_PACKAGES[0];
    if (xmlSchemaTarget) {
      xmlSchemaTarget.innerHTML = `
        <option value="auto">⚡ Detecção Automática (pela Tag Raiz)</option>
        ${pkg.mainSchemas.map(s => `<option value="${s.id}">${s.mainXsd} (${s.name})</option>`).join('')}
      `;
    }
  }

  xmlSchemaCategory?.addEventListener('change', () => {
    updateEnvironmentDropdown(xmlSchemaCategory.value);
  });

  xmlSchemaEnvironment?.addEventListener('change', () => {
    updateSchemaTargetDropdown(xmlSchemaEnvironment.value);
  });

  populateSchemaCategoryDropdown();

  const btnValidateXml = document.getElementById('btn-validate-xml') as HTMLButtonElement;
  const xmlLoadingIndicator = document.getElementById('xml-loading-indicator') as HTMLElement;
  const xmlResultsContainer = document.getElementById('xml-results-container') as HTMLElement;

  const xmlStatTotal = document.getElementById('xml-stat-total') as HTMLElement;
  const xmlStatValid = document.getElementById('xml-stat-valid') as HTMLElement;
  const xmlStatInvalid = document.getElementById('xml-stat-invalid') as HTMLElement;
  const xmlStatErrorsCount = document.getElementById('xml-stat-errors-count') as HTMLElement;

  const xmlResultsTbody = document.getElementById('xml-results-tbody') as HTMLElement;
  const xmlFilterInput = document.getElementById('xml-filter-input') as HTMLInputElement;
  const btnCopyXmlReport = document.getElementById('btn-copy-xml-report') as HTMLButtonElement;

  // Modal elements
  const xmlDetailModal = document.getElementById('xml-detail-modal') as HTMLElement;
  const xmlModalTitle = document.getElementById('xml-modal-title') as HTMLElement;
  const xmlModalSubtitle = document.getElementById('xml-modal-subtitle') as HTMLElement;
  const xmlModalErrorsList = document.getElementById('xml-modal-errors-list') as HTMLElement;
  const xmlModalCodeViewer = document.getElementById('xml-modal-code-viewer') as HTMLElement;
  const xmlModalXsdInfo = document.getElementById('xml-modal-xsd-info') as HTMLElement;
  const btnCloseXmlModal = document.getElementById('btn-close-xml-modal') as HTMLButtonElement;
  const btnCloseXmlModalFooter = document.getElementById('btn-close-xml-modal-footer') as HTMLButtonElement;

  // Mode toggling
  xmlModeBtnText?.addEventListener('click', () => {
    xmlInputMode = 'text';
    xmlModeBtnText.className = 'py-2 px-5 font-bold text-sm border-b-2 border-blue-600 text-blue-700 flex items-center gap-2';
    xmlModeBtnFile.className = 'py-2 px-5 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2';
    xmlContainerText.classList.remove('hidden');
    xmlContainerFile.classList.add('hidden');
  });

  xmlModeBtnFile?.addEventListener('click', () => {
    xmlInputMode = 'file';
    xmlModeBtnFile.className = 'py-2 px-5 font-bold text-sm border-b-2 border-blue-600 text-blue-700 flex items-center gap-2';
    xmlModeBtnText.className = 'py-2 px-5 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2';
    xmlContainerFile.classList.remove('hidden');
    xmlContainerText.classList.add('hidden');
  });

  // Prettify XML
  btnXmlFormat?.addEventListener('click', () => {
    const raw = xmlInputText.value.trim();
    if (!raw) return;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, 'text/xml');
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        alert('XML contém erros de sintaxe e não pôde ser formatado.');
        return;
      }
      const serializer = new XMLSerializer();
      const formatted = formatXmlString(serializer.serializeToString(doc));
      xmlInputText.value = formatted;
    } catch (e) {
      alert('Erro ao formatar XML.');
    }
  });

  function formatXmlString(xml: string): string {
    let formatted = '';
    let reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    let pad = 0;
    xml.split('\r\n').forEach((node) => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/)) {
        if (pad !== 0) {
          pad -= 1;
        }
      } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
        indent = 1;
      } else {
        indent = 0;
      }
      let padding = '';
      for (let i = 0; i < pad; i++) {
        padding += '  ';
      }
      formatted += padding + node + '\r\n';
      pad += indent;
    });
    return formatted.trim();
  }

  btnXmlClear?.addEventListener('click', () => {
    xmlInputText.value = '';
  });

  btnXmlSampleDps?.addEventListener('click', () => {
    xmlInputText.value = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS id="DPS35503082123456789012345678901234567890123456">
    <dhEmi>2026-08-10T10:00:00-03:00</dhEmi>
    <verAplic>1.0.0</verAplic>
    <dCompet>2026-08-10</dCompet>
    <tpEmit>1</tpEmit>
    <cLocEmi>3550308</cLocEmi>
    <prest>
      <CNPJ>12345678000195</CNPJ>
    </prest>
    <toma>
      <CNPJ>98765432000110</CNPJ>
      <xNome>Empresa Exemplo Ltda</xNome>
    </toma>
    <serv>
      <locPrest>
        <cLocPrestacao>3550308</cLocPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>010101</cTribNac>
        <xDescServ>Prestacao de servicos de consultoria em TI</xDescServ>
      </cServ>
    </serv>
    <valores>
      <vServPrest>
        <vServ>1000.00</vServ>
      </vServPrest>
    </valores>
  </infDPS>
</DPS>`;
  });

  btnXmlSampleNfse?.addEventListener('click', () => {
    if (xmlSchemaCategory) {
      xmlSchemaCategory.value = 'nfse_padrao_nacional_prod';
      updateSchemaTargetDropdown('nfse_padrao_nacional_prod');
    }
    xmlInputText.value = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe id="NFS35503082123456789012345678901234567890123456">
    <xLocEmi>SAO PAULO</xLocEmi>
    <xLocPrestacion>SAO PAULO</xLocPrestacion>
    <nNFSe>1052</nNFSe>
    <cLocIncid>3550308</cLocIncid>
    <xLocIncid>SAO PAULO</xLocIncid>
    <dhEmi>2026-08-10T10:30:00-03:00</dhEmi>
    <dCompet>2026-08-10</dCompet>
    <emit>
      <CNPJ>12345678000195</CNPJ>
      <xNome>Prestador Exemplo SA</xNome>
    </emit>
    <valores>
      <vServPrest>
        <vServ>2500.00</vServ>
      </vServPrest>
    </valores>
  </infNFSe>
</NFSe>`;
  });

  btnXmlSampleSpRps?.addEventListener('click', () => {
    if (xmlSchemaCategory) {
      xmlSchemaCategory.value = 'nfse_sp_v02';
      updateSchemaTargetDropdown('nfse_sp_v02');
    }
    xmlInputText.value = `<?xml version="1.0" encoding="utf-8"?>
<PedidoEnvioRPS xmlns="http://www.prefeitura.sp.gov.br/nfe">
  <Cabecalho Versao="1">
    <CPFCNPJRemetente>
      <CNPJ>12345678000195</CNPJ>
    </CPFCNPJRemetente>
  </Cabecalho>
  <RPS>
    <Assinatura>1234567890abcdef1234567890abcdef12345678</Assinatura>
    <ChaveRPS>
      <InscricaoPrestador>12345678</InscricaoPrestador>
      <SerieRPS>AAAAA</SerieRPS>
      <NumeroRPS>105</NumeroRPS>
    </ChaveRPS>
    <TipoRPS>RPS</TipoRPS>
    <DataEmissao>2026-08-10</DataEmissao>
    <StatusRPS>N</StatusRPS>
    <TributacaoRPS>T</TributacaoRPS>
    <ValorServicos>1500.00</ValorServicos>
    <ValorDeducoes>0.00</ValorDeducoes>
    <CodigoServico>0101</CodigoServico>
    <AliquotaServicos>0.05</AliquotaServicos>
    <ISSRetido>false</ISSRetido>
    <CPFCNPJTomador>
      <CNPJ>98765432000110</CNPJ>
    </CPFCNPJTomador>
    <RazaoSocialTomador>Empresa Tomadora de SP Ltda</RazaoSocialTomador>
    <Discriminacao>Prestacao de servicos de desenvolvimento de software em Sao Paulo-SP</Discriminacao>
  </RPS>
</PedidoEnvioRPS>`;
  });

  btnXmlSampleNfeSefaz?.addEventListener('click', () => {
    if (xmlSchemaCategory) {
      xmlSchemaCategory.value = 'NF-e (SEFAZ - Modelo 55/65)';
      updateEnvironmentDropdown('NF-e (SEFAZ - Modelo 55/65)');
    }
    xmlInputText.value = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="NFe35260812345678000195550010000001051000001051">
    <ide>
      <cUF>35</cUF>
      <cNF>00000105</cNF>
      <natOp>VENDA DE MERCADORIA</natOp>
      <mod>55</mod>
      <serie>1</serie>
      <nNF>105</nNF>
      <dhEmi>2026-08-10T10:00:00-03:00</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>3550308</cMunFG>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>1</cDV>
      <tpAmb>2</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>1.0.0</verProc>
    </ide>
    <emit>
      <CNPJ>12345678000195</CNPJ>
      <xNome>EMPRESA EMISSORA EXEMPLO LTDA</xNome>
      <xFant>EMISSORA EXEMPLO</xFant>
      <enderEmit>
        <xLgr>RUA DAS FLORES</xLgr>
        <nro>100</nro>
        <xBairro>CENTRO</xBairro>
        <cMun>3550308</cMun>
        <xMun>SAO PAULO</xMun>
        <UF>SP</UF>
        <CEP>01001000</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
      </enderEmit>
      <IE>123456789110</IE>
      <CRT>3</CRT>
    </emit>
    <dest>
      <CNPJ>98765432000110</CNPJ>
      <xNome>EMPRESA DESTINATARIA EXEMPLO LTDA</xNome>
      <enderDest>
        <xLgr>AVENIDA PAULISTA</xLgr>
        <nro>1500</nro>
        <xBairro>BELA VISTA</xBairro>
        <cMun>3550308</cMun>
        <xMun>SAO PAULO</xMun>
        <UF>SP</UF>
        <CEP>01310100</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
      </enderDest>
      <indIEDest>1</indIEDest>
      <IE>987654321110</IE>
    </dest>
    <det nItem="1">
      <prod>
        <cProd>00001</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>PRODUTO EXEMPLO TESTE MODELO 55</xProd>
        <NCM>84713012</NCM>
        <CFOP>5102</CFOP>
        <uCom>UN</uCom>
        <qCom>1.0000</qCom>
        <vUnCom>100.0000</vUnCom>
        <vProd>100.00</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>UN</uTrib>
        <qTrib>1.0000</qTrib>
        <vUnTrib>100.0000</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <ICMS>
          <ICMS00>
            <orig>0</orig>
            <CST>00</CST>
            <modBC>0</modBC>
            <vBC>100.00</vBC>
            <pICMS>18.00</pICMS>
            <vICMS>18.00</vICMS>
          </ICMS00>
        </ICMS>
        <PIS>
          <PISAliq>
            <CST>01</CST>
            <vBC>100.00</vBC>
            <pPIS>1.65</pPIS>
            <vPIS>1.65</vPIS>
          </PISAliq>
        </PIS>
        <COFINS>
          <COFINSAliq>
            <CST>01</CST>
            <vBC>100.00</vBC>
            <pCOFINS>7.60</pCOFINS>
            <vCOFINS>7.60</vCOFINS>
          </COFINSAliq>
        </COFINS>
      </imposto>
    </det>
    <total>
      <ICMSTot>
        <vBC>100.00</vBC>
        <vICMS>18.00</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <vProd>100.00</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>0.00</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>1.65</vPIS>
        <vCOFINS>7.60</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>100.00</vNF>
      </ICMSTot>
    </total>
    <transp>
      <modFrete>9</modFrete>
    </transp>
    <pag>
      <detPag>
        <tPag>01</tPag>
        <vPag>100.00</vPag>
      </detPag>
    </pag>
  </infNFe>
</NFe>`;
  });

  btnXmlSampleGuarulhos?.addEventListener('click', () => {
    if (xmlSchemaCategory) {
      xmlSchemaCategory.value = 'Guarulhos - SP (Prefeitura / ABRASF)';
      updateEnvironmentDropdown('Guarulhos - SP (Prefeitura / ABRASF)');
    }
    xmlInputText.value = `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.giss.com.br/gerar-nfse-envio-v2_04.xsd" xmlns:tipos="http://www.giss.com.br/tipos-v2_04.xsd">
  <Rps>
    <tipos:InfDeclaracaoPrestacaoServico Id="RPS105">
      <tipos:Rps Id="RPS105">
        <tipos:IdentificacaoRps>
          <tipos:Numero>105</tipos:Numero>
          <tipos:Serie>AAAAA</tipos:Serie>
          <tipos:Tipo>1</tipos:Tipo>
        </tipos:IdentificacaoRps>
        <tipos:DataEmissao>2026-08-10</tipos:DataEmissao>
        <tipos:Status>1</tipos:Status>
      </tipos:Rps>
      <tipos:Competencia>2026-08-10</tipos:Competencia>
      <tipos:Servico>
        <tipos:Valores>
          <tipos:ValorServicos>2000.00</tipos:ValorServicos>
          <tipos:IssRetido>2</tipos:IssRetido>
          <tipos:ItemListaServico>01.01</tipos:ItemListaServico>
          <tipos:Aliquota>0.05</tipos:Aliquota>
        </tipos:Valores>
        <tipos:IssRetido>2</tipos:IssRetido>
        <tipos:ItemListaServico>01.01</tipos:ItemListaServico>
        <tipos:Discriminacao>Prestacao de servicos de tecnologia da informacao em Guarulhos-SP</tipos:Discriminacao>
        <tipos:CodigoMunicipio>3518800</tipos:CodigoMunicipio>
        <tipos:ExigibilidadeISS>1</tipos:ExigibilidadeISS>
      </tipos:Servico>
      <tipos:Prestador>
        <tipos:CpfCnpj>
          <tipos:Cnpj>12345678000195</tipos:Cnpj>
        </tipos:CpfCnpj>
        <tipos:InscricaoMunicipal>123456</tipos:InscricaoMunicipal>
      </tipos:Prestador>
      <tipos:Tomador>
        <tipos:CpfCnpj>
          <tipos:Cnpj>98765432000110</tipos:Cnpj>
        </tipos:CpfCnpj>
        <tipos:RazaoSocial>EMPRESA TOMADORA GUARULHOS LTDA</tipos:RazaoSocial>
      </tipos:Tomador>
      <tipos:OptanteSimplesNacional>2</tipos:OptanteSimplesNacional>
      <tipos:IncentivoFiscal>2</tipos:IncentivoFiscal>
    </tipos:InfDeclaracaoPrestacaoServico>
  </Rps>
</GerarNfseEnvio>`;
  });

  // File Upload Handlers
  xmlInputFiles?.addEventListener('change', (e) => {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    if (files.length > 0) {
      loadedXmlFiles = [...loadedXmlFiles, ...files];
      updateXmlFileList();
    }
  });

  xmlDropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    xmlDropZone.classList.add('border-blue-500', 'bg-blue-50/50');
  });

  xmlDropZone?.addEventListener('dragleave', () => {
    xmlDropZone.classList.remove('border-blue-500', 'bg-blue-50/50');
  });

  xmlDropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    xmlDropZone.classList.remove('border-blue-500', 'bg-blue-50/50');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.xml'));
      if (files.length > 0) {
        loadedXmlFiles = [...loadedXmlFiles, ...files];
        updateXmlFileList();
      }
    }
  });

  btnXmlClearFiles?.addEventListener('click', () => {
    loadedXmlFiles = [];
    if (xmlInputFiles) xmlInputFiles.value = '';
    updateXmlFileList();
  });

  function updateXmlFileList() {
    if (loadedXmlFiles.length === 0) {
      xmlFilesSummary.classList.add('hidden');
      xmlFilesList.innerHTML = '';
      return;
    }

    xmlFilesSummary.classList.remove('hidden');
    xmlFilesCountBadge.textContent = `${loadedXmlFiles.length} arquivo(s) XML carregado(s)`;
    xmlFilesList.innerHTML = loadedXmlFiles.map((f, idx) => `
      <div class="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded">
        <span class="truncate font-semibold text-gray-800">${f.name} <span class="text-gray-400 font-normal">(${(f.size / 1024).toFixed(1)} KB)</span></span>
        <button type="button" data-idx="${idx}" class="btn-remove-single-xml text-red-500 hover:text-red-700 font-bold ml-2">&times;</button>
      </div>
    `).join('');

    xmlFilesList.querySelectorAll('.btn-remove-single-xml').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-idx') || '0', 10);
        loadedXmlFiles.splice(idx, 1);
        updateXmlFileList();
      });
    });
  }

  // Execute Validation
  btnValidateXml?.addEventListener('click', async () => {
    const packageId = xmlSchemaEnvironment ? xmlSchemaEnvironment.value : xmlSchemaCategory.value;
    const forcedSchemaId = xmlSchemaTarget.value;

    xmlLoadingIndicator.classList.remove('hidden');
    xmlResultsContainer.classList.add('hidden');

    try {
      if (xmlInputMode === 'text') {
        const textContent = xmlInputText.value.trim();
        if (!textContent) {
          alert('Por favor, insira o código XML ou selecione um arquivo.');
          xmlLoadingIndicator.classList.add('hidden');
          return;
        }

        const res = await validateSingleXml(textContent, 'documento_colado.xml', packageId, forcedSchemaId);
        currentValidationResults = [res];

      } else {
        if (loadedXmlFiles.length === 0) {
          alert('Nenhum arquivo XML selecionado para validação.');
          xmlLoadingIndicator.classList.add('hidden');
          return;
        }

        const fileBuffers = await Promise.all(
          loadedXmlFiles.map(async (file) => ({
            name: file.name,
            content: await file.text()
          }))
        );

        currentValidationResults = await validateBatchXml(fileBuffers, packageId, forcedSchemaId);
      }

      renderValidationResults(currentValidationResults);

    } catch (err: any) {
      alert(`Erro durante o processamento da validação: ${err?.message || err}`);
    } finally {
      xmlLoadingIndicator.classList.add('hidden');
    }
  });

  function renderValidationResults(results: FileValidationResult[]) {
    xmlResultsContainer.classList.remove('hidden');

    const total = results.length;
    const validCount = results.filter(r => r.valid).length;
    const invalidCount = results.filter(r => !r.valid).length;
    const totalErrorsCount = results.reduce((acc, r) => acc + r.errors.length, 0);

    xmlStatTotal.textContent = String(total);
    xmlStatValid.textContent = String(validCount);
    xmlStatInvalid.textContent = String(invalidCount);
    xmlStatErrorsCount.textContent = String(totalErrorsCount);

    renderTableRows(results);
  }

  function renderTableRows(results: FileValidationResult[]) {
    const filterText = (xmlFilterInput.value || '').toLowerCase().trim();
    const filtered = results.filter(r => {
      if (!filterText) return true;
      if (r.fileName.toLowerCase().includes(filterText)) return true;
      if (r.detectedSchemaName?.toLowerCase().includes(filterText)) return true;
      return r.errors.some(e => e.message.toLowerCase().includes(filterText) || (e.friendlyExplanation && e.friendlyExplanation.toLowerCase().includes(filterText)));
    });

    if (filtered.length === 0) {
      xmlResultsTbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-8 text-center text-gray-500 text-sm">
            Nenhum resultado encontrado para os filtros informados.
          </td>
        </tr>
      `;
      return;
    }

    xmlResultsTbody.innerHTML = filtered.map((r) => {
      const statusBadge = r.valid
        ? `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">✅ VÁLIDO</span>`
        : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">❌ INVÁLIDO</span>`;

      return `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-3 font-semibold text-gray-900 truncate max-w-xs" title="${r.fileName}">${r.fileName}</td>
          <td class="px-4 py-3 text-xs text-gray-600 font-mono">${r.mainXsdUsed || 'N/A'}</td>
          <td class="px-4 py-3 text-center">${statusBadge}</td>
          <td class="px-4 py-3 text-center font-bold ${r.errors.length > 0 ? 'text-red-600' : 'text-gray-400'}">${r.errors.length}</td>
          <td class="px-4 py-3 text-right">
            <button type="button" data-result-idx="${results.indexOf(r)}" class="btn-open-xml-detail text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded border border-blue-200 text-xs font-bold transition-colors">
              Ver Erros & XML
            </button>
          </td>
        </tr>
      `;
    }).join('');

    xmlResultsTbody.querySelectorAll('.btn-open-xml-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-result-idx') || '0', 10);
        openXmlDetailModal(results[idx]);
      });
    });
  }

  xmlFilterInput?.addEventListener('input', () => {
    renderTableRows(currentValidationResults);
  });

  function openXmlDetailModal(res: FileValidationResult) {
    xmlModalTitle.textContent = `Validação: ${res.fileName}`;
    xmlModalSubtitle.textContent = res.valid ? '✅ Arquivo 100% em conformidade com o schema XSD' : `❌ ${res.errors.length} inconformidade(s) encontrada(s)`;
    xmlModalXsdInfo.textContent = res.mainXsdUsed || 'Schema Padrão Nacional';

    // Lista de erros
    if (res.valid || res.errors.length === 0) {
      xmlModalErrorsList.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm font-semibold flex items-center gap-3">
          <svg class="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          Nenhum erro de schema XSD foi encontrado neste arquivo XML!
        </div>
      `;
    } else {
      xmlModalErrorsList.innerHTML = res.errors.map((err, i) => `
        <div class="bg-white border-l-4 border-red-500 rounded-r-lg p-4 shadow-sm border border-gray-200 space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-bold text-red-800 text-xs uppercase">Erro #${i + 1} ${err.lineNumber ? `(Linha ${err.lineNumber})` : ''}</span>
            ${err.elementName ? `<code class="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs border border-red-200 font-mono">&lt;${err.elementName}&gt;</code>` : ''}
          </div>
          <p class="text-sm font-semibold text-gray-900">${err.friendlyExplanation}</p>
          <div class="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded border border-gray-200 mt-2 break-all">
            ${err.rawMessage}
          </div>
        </div>
      `).join('');
    }

    // Renderiza o XML com linhas e destaque de erro
    const errorLines = new Set(res.errors.map(e => e.lineNumber).filter((l): l is number => l !== null));
    const lines = res.rawXml.split('\n');

    xmlModalCodeViewer.innerHTML = lines.map((lineContent, lineIdx) => {
      const lineNum = lineIdx + 1;
      const isErrorLine = errorLines.has(lineNum);
      const bgClass = isErrorLine ? 'bg-red-900/50 text-red-200 border-l-4 border-red-500 font-bold px-2 py-1' : 'hover:bg-gray-800/60 px-2 py-0.5';
      const lineBadge = isErrorLine ? `<span class="bg-red-600 text-white text-[10px] px-1 py-0.2 rounded mr-2 font-mono">ERRO</span>` : '';

      return `
        <div class="flex items-start ${bgClass}">
          <span class="w-12 text-right pr-4 text-gray-500 select-none font-mono text-[11px] flex-shrink-0">${lineNum}</span>
          <span class="whitespace-pre flex-1">${lineBadge}${escapeHtml(lineContent)}</span>
        </div>
      `;
    }).join('');

    xmlDetailModal.classList.remove('hidden');
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  btnCloseXmlModal?.addEventListener('click', () => {
    xmlDetailModal.classList.add('hidden');
  });

  btnCloseXmlModalFooter?.addEventListener('click', () => {
    xmlDetailModal.classList.add('hidden');
  });

  btnCopyXmlReport?.addEventListener('click', () => {
    if (currentValidationResults.length === 0) return;

    let report = `===============================================\n`;
    report += `RELATÓRIO DE VALIDAÇÃO XML - COMPARADOR WEBAPP\n`;
    report += `Data: ${new Date().toLocaleString()}\n`;
    report += `===============================================\n\n`;

    currentValidationResults.forEach((r, idx) => {
      report += `[${idx + 1}] Arquivo: ${r.fileName}\n`;
      report += `     Schema: ${r.mainXsdUsed}\n`;
      report += `     Status: ${r.valid ? 'VÁLIDO' : 'INVÁLIDO'}\n`;
      report += `     Erros: ${r.errors.length}\n`;

      r.errors.forEach((err, eIdx) => {
        report += `     - Erro #${eIdx + 1}${err.lineNumber ? ` (Linha ${err.lineNumber})` : ''}: ${err.friendlyExplanation}\n`;
        report += `       Detalhes libxml: ${err.rawMessage}\n`;
      });
      report += `-----------------------------------------------\n`;
    });

    navigator.clipboard.writeText(report).then(() => {
      alert('Relatório copiado para a área de transferência com sucesso!');
    }).catch(() => {
      alert('Não foi possível copiar o relatório.');
    });
  });

});
