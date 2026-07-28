import { handleBatchProcess } from './batchProcessor.ts';
import { handleFoxProBatchProcess, type FoxProFileMap } from './batchProcessor.ts';
import { handleTextProcess } from './textComparator.ts';
import { FoxProParser } from './foxproParser.ts';
import { handleCodeReferencesSearch, renderTreeResults } from './codeReferences.ts';
import baseHtmlTemplate from './base.html?raw';

document.addEventListener('DOMContentLoaded', () => {
  // Tab Elements
  const tabBatch = document.getElementById('tab-batch') as HTMLButtonElement;
  const tabText = document.getElementById('tab-text') as HTMLButtonElement;
  const tabFoxpro = document.getElementById('tab-foxpro') as HTMLButtonElement;
  const tabFoxproBatch = document.getElementById('tab-foxpro-batch') as HTMLButtonElement;
  const tabCodeReferences = document.getElementById('tab-code-references') as HTMLButtonElement;

  const sectionBatch = document.getElementById('section-batch') as HTMLElement;
  const sectionText = document.getElementById('section-text') as HTMLElement;
  const sectionFoxpro = document.getElementById('section-foxpro') as HTMLElement;
  const sectionFoxproBatch = document.getElementById('section-foxpro-batch') as HTMLElement;
  const sectionCodeReferences = document.getElementById('section-code-references') as HTMLElement;

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
    [tabBatch, tabText, tabFoxpro, tabFoxproBatch, tabCodeReferences].forEach(t => t.classList.replace('tab-active', 'tab-inactive'));
    [sectionBatch, sectionText, sectionFoxpro, sectionFoxproBatch, sectionCodeReferences].forEach(s => s.classList.add('hidden'));
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

  btnProcessBatch.addEventListener('click', async () => {
    if (batchCompareFiles) {
      await handleBatchProcess(baseHtmlTemplate, batchCompareFiles);
    }
  });

  // --- Text Logic Validation ---
  function validateText() {
    const hasOriginal = textOriginal.value.trim().length > 0;
    const hasModified = textModified.value.trim().length > 0;
    
    btnProcessText.disabled = !(hasOriginal && hasModified);
  }

  textOriginal.addEventListener('input', validateText);
  textModified.addEventListener('input', validateText);

  btnProcessText.addEventListener('click', async () => {
      await handleTextProcess(
          textOriginal.value, 
          textModified.value, 
          baseHtmlTemplate, 
          (document.getElementById('text-file-name') as HTMLInputElement).value
      );
  });

  // --- FoxPro Logic Validation ---
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
  function validateFoxProBatch() {
    btnProcessFoxproBatch.disabled = !(foxBatchAntesDirInput.files && foxBatchAntesDirInput.files.length > 0 && foxBatchDepoisDirInput.files && foxBatchDepoisDirInput.files.length > 0);
  }

  function getFileMap(files: FileList | null): FoxProFileMap {
      const map: FoxProFileMap = new Map();
      if (!files) return map;

      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const nameLower = file.name.toLowerCase();
          
          if (nameLower.endsWith('.scx') || nameLower.endsWith('.sct') || 
              nameLower.endsWith('.frx') || nameLower.endsWith('.frt') || 
              nameLower.endsWith('.prg')) {
              
              const baseName = file.name.substring(0, file.name.lastIndexOf('.')).toUpperCase();
              
              // Extract the extension to create a unique map key like "CLIENTES_SCX"
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

  foxBatchAntesDirInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
          const map = getFileMap(files);
          foxBatchAntesCount.textContent = `${map.size} formulários encontrados`;
          foxBatchAntesCount.classList.remove('hidden');
      } else {
          foxBatchAntesCount.classList.add('hidden');
      }
      validateFoxProBatch();
  });

  foxBatchDepoisDirInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
          const map = getFileMap(files);
          foxBatchDepoisCount.textContent = `${map.size} formulários encontrados`;
          foxBatchDepoisCount.classList.remove('hidden');
      } else {
          foxBatchDepoisCount.classList.add('hidden');
      }
      validateFoxProBatch();
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
      const antesFiles = foxBatchAntesDirInput.files;
      const depoisFiles = foxBatchDepoisDirInput.files;

      if (!antesFiles || !depoisFiles) return;

      const antesMap = getFileMap(antesFiles);
      const depoisMap = getFileMap(depoisFiles);

      const checkMissingInput = document.getElementById('fox-batch-check-missing') as HTMLInputElement;
      const checkMissing = checkMissingInput?.checked || false;

      const parser = new FoxProParser();
      btnProcessFoxproBatch.disabled = true;
      btnProcessFoxproBatch.textContent = 'Processando...';

      const results = await handleFoxProBatchProcess(antesMap, depoisMap, baseHtmlTemplate, parser, checkMissing);
      renderFoxBatchDashboard(results);

      btnProcessFoxproBatch.disabled = false;
      btnProcessFoxproBatch.textContent = 'Comparar Lote e Baixar ZIP';
  });

  // --- Code References Logic ---
  const crFolderInput = document.getElementById('cr-folder-input') as HTMLInputElement;
  const crFolderCount = document.getElementById('cr-folder-count') as HTMLElement;
  const crSearchTerm = document.getElementById('cr-search-term') as HTMLInputElement;
  const btnCrAddTerm = document.getElementById('btn-cr-add-term') as HTMLButtonElement;
  const crSearchTags = document.getElementById('cr-search-tags') as HTMLElement;
  
  const crMatchExact = document.getElementById('cr-match-exact') as HTMLInputElement;
  const crMatchCase = document.getElementById('cr-match-case') as HTMLInputElement;
  const crMatchSameMethod = document.getElementById('cr-match-same-method') as HTMLInputElement;
  const btnProcessCr = document.getElementById('btn-process-cr') as HTMLButtonElement;
  const crResultsContainer = document.getElementById('cr-results-container') as HTMLElement;
  const crResultsStats = document.getElementById('cr-results-stats') as HTMLElement;
  const crTreeView = document.getElementById('cr-tree-view') as HTMLElement;

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
              (msg) => {
                  crResultsStats.textContent = msg;
              }
          );
          
          crResultsStats.textContent = `Encontrados ${results.length} resultados.`;
          renderTreeResults(results, crTreeView);
      } catch (err: any) {
          console.error(err);
          crResultsStats.textContent = 'Erro ao pesquisar.';
          crTreeView.innerHTML = `<div class="p-4 text-red-500 text-center">Erro: ${err.message || err}</div>`;
      } finally {
          btnProcessCr.textContent = originalText;
          validateCr();
      }
  });

});
