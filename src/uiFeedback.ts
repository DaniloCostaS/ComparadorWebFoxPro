// Módulo de Diálogos Modais e Notificações Toast Modernas (Substitutos de prompt, confirm e alert nativos)

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  selectLabel?: string;
  selectOptions?: { label: string; value: string }[];
  selectedOption?: string;
}

export interface PromptResult {
  value: string;
  selectedOption?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export interface AlertOptions {
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  confirmText?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Toast Notifications ---
let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'pwi-toast-container';
    toastContainer.className = 'fixed bottom-5 right-5 z-[99999] flex flex-col gap-2.5 pointer-events-none max-w-md w-full px-4';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message: string, type: ToastType = 'success', durationMs = 3200) {
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = 'toast-animate-in pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl shadow-xl border text-xs font-semibold backdrop-blur-md transition-all';

  const typeConfig = {
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800/80 shadow-emerald-500/10',
      icon: '<svg class="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>'
    },
    error: {
      bg: 'bg-rose-50 dark:bg-rose-950/90 text-rose-900 dark:text-rose-100 border-rose-200 dark:border-rose-800/80 shadow-rose-500/10',
      icon: '<svg class="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/90 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800/80 shadow-amber-500/10',
      icon: '<svg class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
    },
    info: {
      bg: 'bg-indigo-50 dark:bg-indigo-950/90 text-indigo-900 dark:text-indigo-100 border-indigo-200 dark:border-indigo-800/80 shadow-indigo-500/10',
      icon: '<svg class="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
    }
  };

  const cfg = typeConfig[type];
  toast.className += ` ${cfg.bg}`;

  toast.innerHTML = `
    <div class="flex items-center gap-2.5 min-w-0">
      ${cfg.icon}
      <span class="truncate leading-relaxed">${escapeHtml(message)}</span>
    </div>
    <button type="button" class="text-current opacity-50 hover:opacity-100 p-1 cursor-pointer transition-opacity leading-none text-base">&times;</button>
  `;

  const closeToast = () => {
    toast.classList.remove('toast-animate-in');
    toast.classList.add('toast-animate-out');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  };

  toast.querySelector('button')?.addEventListener('click', closeToast);
  container.appendChild(toast);

  setTimeout(closeToast, durationMs);
}

// --- Prompt Modal (Substituto do prompt() do navegador) ---
export function promptDialog(options: PromptOptions): Promise<PromptResult | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs z-[99990] flex items-center justify-center p-4';

    const modal = document.createElement('div');
    modal.className = 'modal-animate-pop bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col';

    const selectHtml = options.selectOptions && options.selectOptions.length > 0 ? `
      <div class="space-y-1 mb-3">
        <label class="block text-xs font-semibold text-gray-700 dark:text-slate-300">${escapeHtml(options.selectLabel || 'Selecione:')}</label>
        <select id="pwi-modal-select" class="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer">
          ${options.selectOptions.map(opt => `<option value="${escapeHtml(opt.value)}" ${opt.value === options.selectedOption ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
        </select>
      </div>
    ` : '';

    modal.innerHTML = `
      <div class="px-5 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between bg-gray-50 dark:bg-slate-950">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          <h3 class="font-bold text-sm text-gray-900 dark:text-slate-100">${escapeHtml(options.title)}</h3>
        </div>
        <button type="button" id="pwi-modal-close-btn" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold cursor-pointer p-1 leading-none">&times;</button>
      </div>
      <div class="p-5 space-y-3">
        ${selectHtml}
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-gray-700 dark:text-slate-300">${escapeHtml(options.label || 'Nome:')}</label>
          <input type="text" id="pwi-modal-input" class="w-full px-3.5 py-2.5 text-xs bg-gray-50 dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 shadow-2xs font-medium" value="${escapeHtml(options.defaultValue || '')}" placeholder="${escapeHtml(options.placeholder || '')}" />
        </div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex justify-end gap-2">
        <button type="button" id="pwi-modal-cancel-btn" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer">
          ${escapeHtml(options.cancelText || 'Cancelar')}
        </button>
        <button type="button" id="pwi-modal-confirm-btn" class="px-5 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors shadow-md cursor-pointer">
          ${escapeHtml(options.confirmText || 'Confirmar')}
        </button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const input = modal.querySelector('#pwi-modal-input') as HTMLInputElement | null;
    const select = modal.querySelector('#pwi-modal-select') as HTMLSelectElement | null;
    const confirmBtn = modal.querySelector('#pwi-modal-confirm-btn') as HTMLButtonElement | null;
    const cancelBtn = modal.querySelector('#pwi-modal-cancel-btn') as HTMLButtonElement | null;
    const closeBtn = modal.querySelector('#pwi-modal-close-btn') as HTMLButtonElement | null;

    if (input) {
      input.focus();
      input.select();
    }

    const cleanup = () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };

    const confirm = () => {
      const val = input ? input.value.trim() : '';
      const selected = select ? select.value : undefined;
      cleanup();
      resolve({ value: val, selectedOption: selected });
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    confirmBtn?.addEventListener('click', confirm);
    cancelBtn?.addEventListener('click', cancel);
    closeBtn?.addEventListener('click', cancel);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cancel();
    });
  });
}

// Atalho simples para pedir apenas um texto (retorna string | null)
export async function promptText(title: string, label: string, defaultValue = '', placeholder = ''): Promise<string | null> {
  const res = await promptDialog({
    title,
    label,
    defaultValue,
    placeholder
  });
  return res ? res.value : null;
}

// --- Confirm Modal (Substituto do confirm() do navegador) ---
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs z-[99990] flex items-center justify-center p-4';

    const modal = document.createElement('div');
    modal.className = 'modal-animate-pop bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col';

    const isDanger = options.isDanger === true;
    const confirmBtnClass = isDanger ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white';

    modal.innerHTML = `
      <div class="p-5 flex items-start gap-3">
        <div class="p-2 rounded-full ${isDanger ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'} flex-shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </div>
        <div class="space-y-1">
          <h3 class="font-bold text-sm text-gray-900 dark:text-slate-100">${escapeHtml(options.title)}</h3>
          <p class="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">${escapeHtml(options.message)}</p>
        </div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex justify-end gap-2">
        <button type="button" id="pwi-confirm-cancel-btn" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer">
          ${escapeHtml(options.cancelText || 'Cancelar')}
        </button>
        <button type="button" id="pwi-confirm-ok-btn" class="px-4 py-2 text-xs font-bold ${confirmBtnClass} rounded-lg transition-colors shadow-md cursor-pointer">
          ${escapeHtml(options.confirmText || 'Confirmar')}
        </button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const okBtn = modal.querySelector('#pwi-confirm-ok-btn') as HTMLButtonElement | null;
    const cancelBtn = modal.querySelector('#pwi-confirm-cancel-btn') as HTMLButtonElement | null;

    okBtn?.focus();

    const cleanup = () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };

    const confirm = () => {
      cleanup();
      resolve(true);
    };

    const cancel = () => {
      cleanup();
      resolve(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    okBtn?.addEventListener('click', confirm);
    cancelBtn?.addEventListener('click', cancel);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cancel();
    });
  });
}

// --- Alert Modal (Substituto do alert() do navegador) ---
export function alertDialog(options: AlertOptions): Promise<void> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs z-[99990] flex items-center justify-center p-4';

    const modal = document.createElement('div');
    modal.className = 'modal-animate-pop bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col';

    modal.innerHTML = `
      <div class="p-5 flex items-start gap-3">
        <div class="p-2 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex-shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <div class="space-y-1">
          <h3 class="font-bold text-sm text-gray-900 dark:text-slate-100">${escapeHtml(options.title)}</h3>
          <p class="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">${escapeHtml(options.message)}</p>
        </div>
      </div>
      <div class="px-5 py-3 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex justify-end">
        <button type="button" id="pwi-alert-ok-btn" class="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-md cursor-pointer">
          ${escapeHtml(options.confirmText || 'OK')}
        </button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const okBtn = modal.querySelector('#pwi-alert-ok-btn') as HTMLButtonElement | null;
    okBtn?.focus();

    const cleanup = () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      resolve();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    okBtn?.addEventListener('click', cleanup);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup();
    });
  });
}

// --- Diálogo Personalizado de Upload/Carregamento de Pasta ---
export interface FolderConfirmOptions {
  folderName: string;
  fileCount: number;
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

export function confirmFolderUploadDialog(options: FolderConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs z-[99990] flex items-center justify-center p-4';

    const modal = document.createElement('div');
    modal.className = 'modal-animate-pop bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col';

    const title = options.title || `Fazer upload de ${options.fileCount} arquivo${options.fileCount === 1 ? '' : 's'} para este site?`;
    const confirmText = options.confirmText || 'Fazer upload';
    const cancelText = options.cancelText || 'Cancelar';

    modal.innerHTML = `
      <div class="p-6 flex items-start gap-3.5">
        <div class="p-2.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
          </svg>
        </div>
        <div class="space-y-1.5 flex-1 min-w-0">
          <h3 class="font-bold text-base text-gray-900 dark:text-slate-100 leading-snug">${escapeHtml(title)}</h3>
          <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
            Essa ação fará o upload de todos os arquivos de <strong class="text-gray-900 dark:text-white font-semibold">"${escapeHtml(options.folderName)}"</strong>.
          </p>
          <p class="text-[11px] text-gray-400 dark:text-slate-500">
            Faça isso apenas se você confiar no site. Os arquivos serão processados localmente.
          </p>
        </div>
      </div>
      <div class="px-6 py-3.5 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/80 flex justify-end gap-2.5">
        <button type="button" id="pwi-folder-confirm-cancel-btn" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer">
          ${escapeHtml(cancelText)}
        </button>
        <button type="button" id="pwi-folder-confirm-ok-btn" class="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-md cursor-pointer">
          ${escapeHtml(confirmText)}
        </button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const okBtn = modal.querySelector('#pwi-folder-confirm-ok-btn') as HTMLButtonElement | null;
    const cancelBtn = modal.querySelector('#pwi-folder-confirm-cancel-btn') as HTMLButtonElement | null;

    okBtn?.focus();

    const cleanup = () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };

    const confirm = () => {
      cleanup();
      resolve(true);
    };

    const cancel = () => {
      cleanup();
      resolve(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    okBtn?.addEventListener('click', confirm);
    cancelBtn?.addEventListener('click', cancel);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cancel();
    });
  });
}

// Helper para ler arquivos de FileSystemDirectoryHandle (navegação recursiva)
export async function readFilesFromDirectoryHandle(dirHandle: any, path = ''): Promise<File[]> {
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
      const subFiles = await readFilesFromDirectoryHandle(
        entry,
        path ? `${path}/${entry.name}` : `${dirHandle.name}/${entry.name}`
      );
      files.push(...subFiles);
    }
  }
  return files;
}

// Seletor Inteligente de Pastas com Confirmação Personalizada
export async function pickDirectoryWithCustomConfirm(options: {
  id?: string;
  fallbackInput?: HTMLInputElement;
}): Promise<{ folderName: string; files: File[] } | null> {
  if ('showDirectoryPicker' in window) {
    try {
      let handle: any;
      try {
        handle = await (window as any).showDirectoryPicker(options.id ? { id: options.id } : undefined);
      } catch (pickerErr: any) {
        if (pickerErr.name === 'AbortError') return null;
        if (options.id) {
          handle = await (window as any).showDirectoryPicker();
        } else {
          throw pickerErr;
        }
      }
      const files = await readFilesFromDirectoryHandle(handle);
      if (files.length === 0) {
        showToast('Nenhum arquivo encontrado na pasta selecionada.', 'warning');
        return null;
      }
      const confirmed = await confirmFolderUploadDialog({
        folderName: handle.name,
        fileCount: files.length
      });
      if (!confirmed) {
        return null;
      }
      return { folderName: handle.name, files };
    } catch (err: any) {
      if (err.name === 'AbortError') return null; // Usuário cancelou no seletor do SO
      console.warn('showDirectoryPicker falhou, tentando fallback:', err);
    }
  }

  // Fallback para navegadores sem showDirectoryPicker
  const fallbackInput = options.fallbackInput;
  if (fallbackInput) {
    return new Promise((resolve) => {
      const handler = async (e: Event) => {
        fallbackInput.removeEventListener('change', handler);
        const fileList = (e.target as HTMLInputElement).files;
        if (!fileList || fileList.length === 0) {
          resolve(null);
          return;
        }
        const filesArray = Array.from(fileList);
        const folderName = filesArray[0]?.webkitRelativePath?.split('/')[0] || 'Pasta selecionada';
        const confirmed = await confirmFolderUploadDialog({
          folderName,
          fileCount: filesArray.length
        });
        if (!confirmed) {
          fallbackInput.value = '';
          resolve(null);
          return;
        }
        resolve({ folderName, files: filesArray });
      };
      fallbackInput.addEventListener('change', handler);
      fallbackInput.click();
    });
  }

  return null;
}
