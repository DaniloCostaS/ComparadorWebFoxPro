import { handleBatchProcess } from './batchProcessor.ts';
import { handleTextProcess } from './textComparator.ts';
import { FoxProParser } from './foxproParser.ts';
import baseHtmlTemplate from './base.html?raw';

document.addEventListener('DOMContentLoaded', () => {
  // Tab Elements
  const tabBatch = document.getElementById('tab-batch') as HTMLButtonElement;
  const tabText = document.getElementById('tab-text') as HTMLButtonElement;
  const tabFoxpro = document.getElementById('tab-foxpro') as HTMLButtonElement;
  const sectionBatch = document.getElementById('section-batch') as HTMLElement;
  const sectionText = document.getElementById('section-text') as HTMLElement;
  const sectionFoxpro = document.getElementById('section-foxpro') as HTMLElement;

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

  // --- Tab Logic ---
  tabBatch.addEventListener('click', () => {
    tabBatch.classList.replace('tab-inactive', 'tab-active');
    tabText.classList.replace('tab-active', 'tab-inactive');
    tabFoxpro.classList.replace('tab-active', 'tab-inactive');
    sectionBatch.classList.remove('hidden');
    sectionText.classList.add('hidden');
    sectionFoxpro.classList.add('hidden');
  });

  tabText.addEventListener('click', () => {
    tabText.classList.replace('tab-inactive', 'tab-active');
    tabBatch.classList.replace('tab-active', 'tab-inactive');
    tabFoxpro.classList.replace('tab-active', 'tab-inactive');
    sectionText.classList.remove('hidden');
    sectionBatch.classList.add('hidden');
    sectionFoxpro.classList.add('hidden');
  });

  tabFoxpro.addEventListener('click', () => {
    tabFoxpro.classList.replace('tab-inactive', 'tab-active');
    tabBatch.classList.replace('tab-active', 'tab-inactive');
    tabText.classList.replace('tab-active', 'tab-inactive');
    sectionFoxpro.classList.remove('hidden');
    sectionBatch.classList.add('hidden');
    sectionText.classList.add('hidden');
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
    btnProcessFoxpro.disabled = !(foxAntesFilesInput.files && foxAntesFilesInput.files.length >= 2 && foxDepoisFilesInput.files && foxDepoisFilesInput.files.length >= 2);
  }

  foxAntesFilesInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length >= 2) {
          foxAntesCount.textContent = `${files.length} arquivos carregados`;
          foxAntesCount.classList.remove('hidden');
      } else {
          foxAntesCount.classList.add('hidden');
      }
      validateFoxPro();
  });

  foxDepoisFilesInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length >= 2) {
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

      if (!antesFiles || antesFiles.length < 2 || !depoisFiles || depoisFiles.length < 2) return;

      const getBuffers = async (files: FileList) => {
          let scx: ArrayBuffer | null = null;
          let sct: ArrayBuffer | null = null;
          let scxName = '';
          for (let i = 0; i < files.length; i++) {
              if (files[i].name.toLowerCase().endsWith('.scx')) {
                  scx = await files[i].arrayBuffer();
                  scxName = files[i].name.replace(/\.scx$/i, '');
              }
              if (files[i].name.toLowerCase().endsWith('.sct')) {
                  sct = await files[i].arrayBuffer();
              }
          }
          return { scx, sct, scxName };
      };

      try {
          const antes = await getBuffers(antesFiles);
          const depois = await getBuffers(depoisFiles);

          if (!antes.scx || !antes.sct || !depois.scx || !depois.sct) {
              alert('Por favor, certifique-se de selecionar os arquivos .SCX e .SCT para ambas as versões.');
              return;
          }

          const parser = new FoxProParser();
          const antesText = parser.parse(antes.scx, antes.sct);
          const depoisText = parser.parse(depois.scx, depois.sct);

          const finalName = foxFileName.value.trim() || antes.scxName || 'FORM_COMPARADO';

          await handleTextProcess(antesText, depoisText, baseHtmlTemplate, finalName);
          alert('Comparação FoxPro concluída e baixada com sucesso!');
      } catch (err) {
          console.error(err);
          alert('Erro ao processar os arquivos do FoxPro.');
      }
  });

});


