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

  btnProcessFoxproBatch.addEventListener('click', async () => {
      const antesFiles = foxBatchAntesDirInput.files;
      const depoisFiles = foxBatchDepoisDirInput.files;

      if (!antesFiles || !depoisFiles) return;

      const antesMap = getFileMap(antesFiles);
      const depoisMap = getFileMap(depoisFiles);

      const parser = new FoxProParser();
      btnProcessFoxproBatch.disabled = true;
      btnProcessFoxproBatch.textContent = 'Processando...';

      await handleFoxProBatchProcess(antesMap, depoisMap, baseHtmlTemplate, parser);

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
