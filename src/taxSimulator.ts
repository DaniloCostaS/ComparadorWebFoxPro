/**
 * Controlador de Interface do Simulador Tributário NF-e
 * Gerencia inputs, conexão SQL Server, execução do TaxEngine e renderização da Memória de Cálculo
 */

import { TaxEngine } from './fiscal/taxEngine';
import { SqlDataLoader } from './fiscal/sqlDataLoader';
import type {
  SqlServerConfig,
  ItemFiscalInput,
  CabecalhoFiscalInput,
  CalculatedItemResult,
  SimulationPayload
} from './fiscal/types';

const STORAGE_KEY_SQL_CONFIG = 'comparador_sql_config';

export class TaxSimulator {
  private sqlConfig: SqlServerConfig = {
    server: '',
    port: 1433,
    database: '',
    user: '',
    password: '',
    instanceName: '',
    encrypt: false,
    trustServerCertificate: true
  };

  private isConnected: boolean = false;
  private lastResult: CalculatedItemResult | null = null;
  private activeTaxFilter: string = 'ALL';

  constructor() {
    this.loadSavedConfig();
    this.initEventListeners();
    this.populateModalInputs();
    this.updateConnectionStatusBadge();

    // Auto-conectar se já possuir servidor e banco salvos em localStorage
    if (this.sqlConfig.server && this.sqlConfig.database) {
      this.testSqlConnection(true);
    }
  }

  private loadSavedConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SQL_CONFIG);
      if (saved) {
        this.sqlConfig = { ...this.sqlConfig, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Erro ao carregar configurações salvas do SQL:', e);
    }
  }

  private saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY_SQL_CONFIG, JSON.stringify(this.sqlConfig));
    } catch (e) {
      console.warn('Erro ao salvar configurações do SQL:', e);
    }
  }

  private populateModalInputs() {
    const setVal = (id: string, val: string) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.value = val;
    };
    setVal('sql-input-server', this.sqlConfig.server || '');
    setVal('sql-input-port', String(this.sqlConfig.port || 1433));
    setVal('sql-input-database', this.sqlConfig.database || '');
    setVal('sql-input-user', this.sqlConfig.user || '');
    setVal('sql-input-password', this.sqlConfig.password || '');
    setVal('sql-input-instance', this.sqlConfig.instanceName || '');
    const trustEl = document.getElementById('sql-input-trust') as HTMLInputElement;
    if (trustEl) trustEl.checked = this.sqlConfig.trustServerCertificate ?? true;
  }

  private initEventListeners() {
    // Botão abrir modal SQL
    const btnConfig = document.getElementById('btn-sql-config');
    btnConfig?.addEventListener('click', () => this.openSqlModal());

    // Botão fechar modal SQL
    const btnCloseModal = document.getElementById('btn-close-sql-modal');
    btnCloseModal?.addEventListener('click', () => this.closeSqlModal());

    // Botão testar conexão
    const btnTest = document.getElementById('btn-sql-test');
    btnTest?.addEventListener('click', () => this.testSqlConnection(false));

    // Botão salvar configuração
    const btnSave = document.getElementById('btn-sql-save');
    btnSave?.addEventListener('click', async () => {
      this.readModalInputs();
      this.saveConfig();
      const saveBtn = btnSave as HTMLButtonElement;
      const originalHtml = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-white inline" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> Salvando e Conectando...`;

      try {
        const ok = await this.testSqlConnection(false);
        if (ok) {
          setTimeout(() => this.closeSqlModal(), 600);
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
      }
    });

    // Botão Simular
    const btnSimular = document.getElementById('btn-run-simulation');
    btnSimular?.addEventListener('click', () => this.runSimulation());

    // Sincronização automática Quantidade x Valor Unitário -> Total
    const inputQtd = document.getElementById('sim-item-qtd') as HTMLInputElement;
    const inputUnit = document.getElementById('sim-item-unit') as HTMLInputElement;
    const inputTotal = document.getElementById('sim-item-total') as HTMLInputElement;

    const updateTotal = () => {
      const q = parseFloat(inputQtd?.value || '1');
      const u = parseFloat(inputUnit?.value || '0');
      if (inputTotal && !isNaN(q) && !isNaN(u)) {
        inputTotal.value = (q * u).toFixed(2);
      }
    };

    inputQtd?.addEventListener('input', updateTotal);
    inputUnit?.addEventListener('input', updateTotal);

    // Botão Exportar Memória JSON
    const btnExport = document.getElementById('btn-export-simulation');
    btnExport?.addEventListener('click', () => this.exportSimulation());

    // Botão abrir modal de busca de produtos no banco
    const btnSearchProd = document.getElementById('btn-search-prod');
    btnSearchProd?.addEventListener('click', () => this.openProductSearchModal());

    // Botão fechar modal de busca de produtos
    const btnCloseSearchProd = document.getElementById('btn-close-search-prod-modal');
    btnCloseSearchProd?.addEventListener('click', () => this.closeProductSearchModal());

    // Input de busca de produtos no modal
    const inputSearchProd = document.getElementById('search-prod-input') as HTMLInputElement;
    let searchDebounce: any = null;
    inputSearchProd?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        this.searchProducts(inputSearchProd.value.trim());
      }, 300);
    });

    // Validação ao digitar código do produto no formulário
    const inputProd = document.getElementById('sim-item-prod') as HTMLInputElement;
    inputProd?.addEventListener('blur', () => {
      this.validateAndPreviewProduct(inputProd.value.trim());
    });
    inputProd?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.validateAndPreviewProduct(inputProd.value.trim());
      }
    });

    // Botão abrir modal de busca de clientes no banco
    const btnSearchCli = document.getElementById('btn-search-cli');
    btnSearchCli?.addEventListener('click', () => this.openClientSearchModal());

    // Botão fechar modal de busca de clientes
    const btnCloseSearchCli = document.getElementById('btn-close-search-cli-modal');
    btnCloseSearchCli?.addEventListener('click', () => this.closeClientSearchModal());

    // Input de busca de clientes no modal
    const inputSearchCli = document.getElementById('search-cli-input') as HTMLInputElement;
    let searchCliDebounce: any = null;
    inputSearchCli?.addEventListener('input', () => {
      clearTimeout(searchCliDebounce);
      searchCliDebounce = setTimeout(() => {
        this.searchClients(inputSearchCli.value.trim());
      }, 300);
    });

    // Validação ao digitar código do cliente no formulário
    const inputCli = document.getElementById('sim-cab-cliente') as HTMLInputElement;
    inputCli?.addEventListener('blur', () => {
      this.validateAndPreviewClient(inputCli.value.trim());
    });
    inputCli?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.validateAndPreviewClient(inputCli.value.trim());
      }
    });

    // Filtros de impostos na pirâmide
    const filterButtons = document.querySelectorAll('.tax-filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tax = target.getAttribute('data-tax') || 'ALL';
        this.activeTaxFilter = tax;
        filterButtons.forEach(b => b.classList.remove('bg-blue-600', 'text-white'));
        target.classList.add('bg-blue-600', 'text-white');
        this.renderHierarchySteps();
      });
    });
  }

  private openSqlModal() {
    const modal = document.getElementById('sql-config-modal');
    if (!modal) return;
    this.populateModalInputs();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  private closeSqlModal() {
    const modal = document.getElementById('sql-config-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  private readModalInputs() {
    const serverInput = document.getElementById('sql-input-server') as HTMLInputElement;
    if (serverInput && serverInput.value.trim()) {
      this.sqlConfig.server = serverInput.value.trim();
    }
    const portInput = document.getElementById('sql-input-port') as HTMLInputElement;
    if (portInput && portInput.value) {
      this.sqlConfig.port = parseInt(portInput.value, 10) || 1433;
    }
    const dbInput = document.getElementById('sql-input-database') as HTMLInputElement;
    if (dbInput && dbInput.value.trim()) {
      this.sqlConfig.database = dbInput.value.trim();
    }
    const userInput = document.getElementById('sql-input-user') as HTMLInputElement;
    if (userInput) {
      this.sqlConfig.user = userInput.value.trim();
    }
    const passInput = document.getElementById('sql-input-password') as HTMLInputElement;
    if (passInput) {
      this.sqlConfig.password = passInput.value;
    }
    const instInput = document.getElementById('sql-input-instance') as HTMLInputElement;
    if (instInput) {
      this.sqlConfig.instanceName = instInput.value.trim();
    }
    const trustInput = document.getElementById('sql-input-trust') as HTMLInputElement;
    if (trustInput) {
      this.sqlConfig.trustServerCertificate = trustInput.checked;
    }
  }

  public async testSqlConnection(silent: boolean = false): Promise<boolean> {
    this.readModalInputs();
    const statusEl = document.getElementById('sql-test-status');
    if (statusEl && !silent) {
      statusEl.textContent = 'Conectando ao SQL Server...';
      statusEl.className = 'text-xs text-blue-500 font-semibold';
    }

    if (!this.sqlConfig.server || !this.sqlConfig.database) {
      this.isConnected = false;
      this.updateConnectionStatusBadge();
      if (statusEl && !silent) {
        statusEl.textContent = '❌ Servidor e Banco são obrigatórios.';
        statusEl.className = 'text-xs text-red-500 font-semibold';
      }
      return false;
    }

    try {
      const res = await fetch('/api/sql/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: this.sqlConfig })
      });

      const data = await res.json();
      if (data.success) {
        this.isConnected = true;
        if (statusEl && !silent) {
          statusEl.textContent = `✅ Conectado com sucesso ao banco [${data.database}]!`;
          statusEl.className = 'text-xs text-green-500 font-semibold';
        }
        return true;
      } else {
        this.isConnected = false;
        if (statusEl && !silent) {
          statusEl.textContent = `❌ Falha: ${data.error}`;
          statusEl.className = 'text-xs text-red-500 font-semibold';
        }
        return false;
      }
    } catch (err: any) {
      this.isConnected = false;
      if (statusEl && !silent) {
        statusEl.textContent = `❌ Erro de requisição: ${err.message}. Verifique se o servidor Vite está ativo.`;
        statusEl.className = 'text-xs text-red-500 font-semibold';
      }
      return false;
    } finally {
      this.updateConnectionStatusBadge();
    }
  }

  private updateConnectionStatusBadge() {
    const badge = document.getElementById('sql-status-badge');
    if (!badge) return;

    if (this.isConnected) {
      badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span>SQL Server: Conectado [${this.sqlConfig.database || 'Online'}]</span>`;
    } else {
      badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span><span>SQL Server: Desconectado (Modo Simulação)</span>`;
    }
  }

  private openProductSearchModal() {
    const modal = document.getElementById('product-search-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const input = document.getElementById('search-prod-input') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.focus();
    }
    this.searchProducts('');
  }

  private closeProductSearchModal() {
    const modal = document.getElementById('product-search-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  private async searchProducts(term: string) {
    const resultsContainer = document.getElementById('search-prod-results');
    const countEl = document.getElementById('search-prod-count');
    if (!resultsContainer) return;

    if (!this.isConnected) {
      resultsContainer.innerHTML = `
        <div class="p-6 text-center text-xs text-amber-600 dark:text-amber-400">
          ⚠️ SQL Server desconectado. Conecte ao banco para consultar a tabela TB_PRODUTOS em tempo real.
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = `
      <div class="p-6 text-center text-xs text-gray-400">
        <svg class="animate-spin h-5 w-5 text-blue-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> Consultando TB_PRODUTOS no SQL Server...
      </div>
    `;

    try {
      const res = await fetch('/api/sql/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: this.sqlConfig,
          entity: 'produto',
          term
        })
      });

      const data = await res.json();
      if (!data.success || !data.rows || data.rows.length === 0) {
        if (countEl) countEl.textContent = '0 encontrados';
        resultsContainer.innerHTML = `
          <div class="p-6 text-center text-xs text-gray-500">
            Nenhum produto encontrado para o termo "${term}".
          </div>
        `;
        return;
      }

      if (countEl) countEl.textContent = `${data.rows.length} produtos`;

      resultsContainer.innerHTML = data.rows.map((p: any) => `
        <div class="p-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800/80 cursor-pointer flex items-center justify-between transition-colors border border-transparent hover:border-blue-200 dark:hover:border-slate-700 search-prod-row"
             data-prod-id="${p.PK_ID}" data-prod-desc="${p.DS_PRODUTO || p.DS_NOME || ''}">
          <div class="min-w-0 pr-3">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-xs text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded shrink-0">${p.PK_ID}</span>
              <span class="text-xs font-bold text-gray-900 dark:text-white truncate">${p.DS_PRODUTO || p.DS_NOME || '(Sem descrição)'}</span>
            </div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              NCM: <strong class="font-mono text-gray-700 dark:text-gray-300">${p.FK_CLAFIS || 'N/A'}</strong> | CST ICMS: <strong class="font-mono text-gray-700 dark:text-gray-300">${p.CD_SITTRIBUTARIA || '00'}</strong>
            </div>
          </div>
          <button type="button" class="text-xs font-bold px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white shadow-xs shrink-0 cursor-pointer">
            Selecionar
          </button>
        </div>
      `).join('');

      resultsContainer.querySelectorAll('.search-prod-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-prod-id') || '';
          const desc = row.getAttribute('data-prod-desc') || '';
          this.selectProduct(id, desc);
        });
      });
    } catch (err: any) {
      resultsContainer.innerHTML = `
        <div class="p-4 text-center text-xs text-red-500">
          Erro ao consultar produtos: ${err.message}
        </div>
      `;
    }
  }

  private selectProduct(id: string, desc: string) {
    const input = document.getElementById('sim-item-prod') as HTMLInputElement;
    if (input) input.value = id;
    const infoEl = document.getElementById('sim-prod-info');
    if (infoEl) {
      infoEl.textContent = `✅ ${desc}`;
      infoEl.className = 'text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[300px]';
    }
    this.closeProductSearchModal();
  }

  public async validateAndPreviewProduct(code: string) {
    const infoEl = document.getElementById('sim-prod-info');
    if (!infoEl || !code) {
      if (infoEl) infoEl.textContent = '';
      return;
    }

    if (!this.isConnected) {
      infoEl.textContent = 'Modo Offline (Simulação)';
      infoEl.className = 'text-xs font-semibold text-amber-600 dark:text-amber-400';
      return;
    }

    infoEl.textContent = 'Verificando no banco...';
    infoEl.className = 'text-xs text-gray-400';

    try {
      const res = await fetch('/api/sql/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: this.sqlConfig,
          entity: 'produto',
          term: code
        })
      });

      const data = await res.json();
      if (data.success && data.rows && data.rows.length > 0) {
        const exact = data.rows.find((r: any) => String(r.PK_ID).trim().toLowerCase() === code.trim().toLowerCase());
        if (exact) {
          infoEl.textContent = `✅ ${exact.DS_PRODUTO || exact.DS_NOME || 'Encontrado'}`;
          infoEl.className = 'text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[300px]';
          return;
        }
      }
      infoEl.textContent = '❌ Produto não cadastrado no banco';
      infoEl.className = 'text-xs font-semibold text-red-500 dark:text-red-400 truncate max-w-[300px]';
    } catch {
      infoEl.textContent = '';
    }
  }

  private openClientSearchModal() {
    const modal = document.getElementById('client-search-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const input = document.getElementById('search-cli-input') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.focus();
    }
    this.searchClients('');
  }

  private closeClientSearchModal() {
    const modal = document.getElementById('client-search-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  private async searchClients(term: string) {
    const resultsContainer = document.getElementById('search-cli-results');
    const countEl = document.getElementById('search-cli-count');
    if (!resultsContainer) return;

    if (!this.isConnected) {
      resultsContainer.innerHTML = `
        <div class="p-6 text-center text-xs text-amber-600 dark:text-amber-400">
          ⚠️ SQL Server desconectado. Conecte ao banco para consultar a tabela TB_CADUNICO em tempo real.
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = `
      <div class="p-6 text-center text-xs text-gray-400">
        <svg class="animate-spin h-5 w-5 text-blue-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> Consultando TB_CADUNICO no SQL Server...
      </div>
    `;

    try {
      const res = await fetch('/api/sql/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: this.sqlConfig,
          entity: 'cliente',
          term
        })
      });

      const data = await res.json();
      if (!data.success || !data.rows || data.rows.length === 0) {
        if (countEl) countEl.textContent = '0 encontrados';
        resultsContainer.innerHTML = `
          <div class="p-6 text-center text-xs text-gray-500">
            Nenhum cliente encontrado para o termo "${term}".
          </div>
        `;
        return;
      }

      if (countEl) countEl.textContent = `${data.rows.length} clientes`;

      resultsContainer.innerHTML = data.rows.map((c: any) => `
        <div class="p-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800/80 cursor-pointer flex items-center justify-between transition-colors border border-transparent hover:border-blue-200 dark:hover:border-slate-700 search-cli-row"
             data-cli-id="${c.PK_ID}" data-cli-nome="${c.DS_NOME || ''}" data-cli-uf="${c.DS_UF || ''}">
          <div class="min-w-0 pr-3">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-xs text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded shrink-0">ID: ${c.PK_ID}</span>
              <span class="text-xs font-bold text-gray-900 dark:text-white truncate">${c.DS_NOME || '(Sem nome)'}</span>
            </div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              UF: <strong class="font-mono text-gray-700 dark:text-gray-300">${c.DS_UF || 'N/A'}</strong> | Contribuinte: <strong class="font-mono text-gray-700 dark:text-gray-300">${c.TG_CONTRIBUINTEICMS === 1 ? 'Sim' : 'Não'}</strong> | Tipo: <strong class="font-mono text-gray-700 dark:text-gray-300">${c.TG_PESSOA === 'J' ? 'PJ' : 'PF'}</strong>
            </div>
          </div>
          <button type="button" class="text-xs font-bold px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white shadow-xs shrink-0 cursor-pointer">
            Selecionar
          </button>
        </div>
      `).join('');

      resultsContainer.querySelectorAll('.search-cli-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-cli-id') || '';
          const nome = row.getAttribute('data-cli-nome') || '';
          const uf = row.getAttribute('data-cli-uf') || '';
          this.selectClient(id, nome, uf);
        });
      });
    } catch (err: any) {
      resultsContainer.innerHTML = `
        <div class="p-4 text-center text-xs text-red-500">
          Erro ao consultar clientes: ${err.message}
        </div>
      `;
    }
  }

  private selectClient(id: string, nome: string, uf?: string) {
    const input = document.getElementById('sim-cab-cliente') as HTMLInputElement;
    if (input) input.value = id;
    const infoEl = document.getElementById('sim-cli-info');
    if (infoEl) {
      infoEl.textContent = `✅ ${nome} (${uf || 'UF N/A'})`;
      infoEl.className = 'text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[280px]';
    }
    if (uf) {
      const ufInput = document.getElementById('sim-cab-uf') as HTMLInputElement;
      if (ufInput) ufInput.value = uf.toUpperCase();
    }
    this.closeClientSearchModal();
  }

  public async validateAndPreviewClient(code: string) {
    const infoEl = document.getElementById('sim-cli-info');
    if (!infoEl || !code) {
      if (infoEl) infoEl.textContent = '';
      return;
    }

    if (!this.isConnected) {
      infoEl.textContent = 'Modo Offline (Simulação)';
      infoEl.className = 'text-xs font-semibold text-amber-600 dark:text-amber-400';
      return;
    }

    infoEl.textContent = 'Verificando cliente no banco...';
    infoEl.className = 'text-xs text-gray-400';

    try {
      const res = await fetch('/api/sql/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: this.sqlConfig,
          entity: 'cliente',
          term: code
        })
      });

      const data = await res.json();
      if (data.success && data.rows && data.rows.length > 0) {
        const exact = data.rows.find((r: any) => String(r.PK_ID).trim() === code.trim());
        if (exact) {
          infoEl.textContent = `✅ ${exact.DS_NOME || 'Encontrado'} (${exact.DS_UF || ''})`;
          infoEl.className = 'text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[280px]';
          if (exact.DS_UF) {
            const ufInput = document.getElementById('sim-cab-uf') as HTMLInputElement;
            if (ufInput) ufInput.value = exact.DS_UF.toUpperCase();
          }
          return;
        }
      }
      infoEl.textContent = '❌ Cliente não cadastrado no banco';
      infoEl.className = 'text-xs font-semibold text-red-500 dark:text-red-400 truncate max-w-[280px]';
    } catch {
      infoEl.textContent = '';
    }
  }

  private getInputs(): { item: ItemFiscalInput; cabecalho: CabecalhoFiscalInput } {
    const fkProduto = (document.getElementById('sim-item-prod') as HTMLInputElement)?.value.trim() || '001';
    const fkCfop = parseInt((document.getElementById('sim-item-cfop') as HTMLInputElement)?.value || '5102', 10);
    const qtMovimento = parseFloat((document.getElementById('sim-item-qtd') as HTMLInputElement)?.value || '1');
    const vlUnitario = parseFloat((document.getElementById('sim-item-unit') as HTMLInputElement)?.value || '100');
    const vlTotal = parseFloat((document.getElementById('sim-item-total') as HTMLInputElement)?.value || '100');

    const vlFrete = parseFloat((document.getElementById('sim-item-frete') as HTMLInputElement)?.value || '0');
    const vlSeguro = parseFloat((document.getElementById('sim-item-seguro') as HTMLInputElement)?.value || '0');
    const vlDespesas = parseFloat((document.getElementById('sim-item-despesas') as HTMLInputElement)?.value || '0');
    const vlDesconto = parseFloat((document.getElementById('sim-item-desconto') as HTMLInputElement)?.value || '0');

    const tipo = ((document.getElementById('sim-cab-tipo') as HTMLSelectElement)?.value || 'S') as 'S' | 'E';
    const fkEmpresa = (document.getElementById('sim-cab-empresa') as HTMLInputElement)?.value.trim() || '01';
    const fkCadunico = parseInt((document.getElementById('sim-cab-cliente') as HTMLInputElement)?.value || '1001', 10);
    const dsUf = (document.getElementById('sim-cab-uf') as HTMLInputElement)?.value.trim().toUpperCase() || 'SP';
    const tgRegime = parseInt((document.getElementById('sim-cab-regime') as HTMLSelectElement)?.value || '1', 10);

    return {
      item: {
        fkProduto,
        fkCfop,
        qtMovimento: isNaN(qtMovimento) ? 1 : qtMovimento,
        vlUnitario: isNaN(vlUnitario) ? 0 : vlUnitario,
        vlTotal: isNaN(vlTotal) ? undefined : vlTotal,
        vlFrete: isNaN(vlFrete) ? 0 : vlFrete,
        vlSeguro: isNaN(vlSeguro) ? 0 : vlSeguro,
        vlDespesas: isNaN(vlDespesas) ? 0 : vlDespesas,
        vlDesconto: isNaN(vlDesconto) ? 0 : vlDesconto
      },
      cabecalho: {
        tipo,
        fkEmpresa,
        fkCadunico: isNaN(fkCadunico) ? 1001 : fkCadunico,
        dsUf,
        tgRegime
      }
    };
  }

  public async runSimulation() {
    const { item, cabecalho } = this.getInputs();
    const btn = document.getElementById('btn-run-simulation') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> Processando Regras Fiscais...`;
    }

    const bannerEl = document.getElementById('sim-datasource-banner');

    try {
      let payload: SimulationPayload;
      let usedRealSql = false;
      let dbName = '';
      let diagnosticsInfo = '';

      // Se temos dados salvos mas a flag de conexão está false, tenta conectar
      if (!this.isConnected && this.sqlConfig.server && this.sqlConfig.database) {
        await this.testSqlConnection(true);
      }

      if (this.isConnected && this.sqlConfig.server && this.sqlConfig.database) {
        // Busca os dados reais via endpoint Node /api/sql/load-simulation-data
        const resp = await fetch('/api/sql/load-simulation-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: this.sqlConfig,
            params: {
              cfop: item.fkCfop,
              produto: item.fkProduto,
              empresa: cabecalho.fkEmpresa,
              cliente: cabecalho.fkCadunico,
              uf: cabecalho.dsUf,
              destMer: parseInt((document.getElementById('sim-item-destmer') as HTMLSelectElement)?.value || '1', 10)
            }
          })
        });
        const data = await resp.json();
        if (resp.ok && data.success && data.cursors) {
          payload = {
            item,
            cabecalho,
            cursors: data.cursors
          };
          usedRealSql = true;
          dbName = data.database || this.sqlConfig.database;
          if (data.diagnostics) {
            const d = data.diagnostics;
            diagnosticsInfo = ` | Produto: [${d.productId}] ${d.productName ? `${d.productName}` : 'Localizado'} | CFOP: ${item.fkCfop} | Empresa: ${cabecalho.fkEmpresa} | UF: ${cabecalho.dsUf}`;
          }
        } else {
          alert(`❌ Não foi possível realizar o cálculo no SQL Server:\n\n${data.error || 'Erro ao consultar os dados tributários do banco de dados.'}`);
          return;
        }
      } else {
        // Modo offline / demonstração
        payload = SqlDataLoader.getMockSimulationPayload(item, cabecalho);
      }

      // Atualiza o banner de origem dos dados
      if (bannerEl) {
        bannerEl.classList.remove('hidden');
        if (usedRealSql) {
          bannerEl.className = 'p-3.5 rounded-xl border text-xs font-semibold mb-4 bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center justify-between';
          bannerEl.innerHTML = `
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block shrink-0"></span>
              <span><strong>Base Online:</strong> Dados fiscais consultados diretamente no SQL Server <strong>[${dbName}]</strong> (${this.sqlConfig.server})${diagnosticsInfo}</span>
            </div>
            <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 shrink-0">Tempo Real</span>
          `;
        } else {
          bannerEl.className = 'p-3.5 rounded-xl border text-xs font-semibold mb-4 bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-center justify-between';
          bannerEl.innerHTML = `
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shrink-0"></span>
              <span><strong>Modo Simulação Offline:</strong> Utilizando dados locais de exemplo. Conecte ao SQL Server para consultar os dados reais da sua base.</span>
            </div>
            <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 shrink-0">Offline / Mock</span>
          `;
        }
      }

      // Executa o motor em TypeScript
      this.lastResult = TaxEngine.calculate(payload);
      this.renderResults();
    } catch (err: any) {
      console.error('Erro na simulação:', err);
      alert(`Erro durante a simulação tributária:\n${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>🚀</span> Simular Cálculo com Memória`;
      }
    }
  }

  private renderResults() {
    if (!this.lastResult) return;
    const res = this.lastResult;

    // 1. Atualizar Cards de Resumo
    this.setText('res-total-produtos', `R$ ${res.vlPretot.toFixed(2)}`);
    this.setText('res-total-nota', `R$ ${(res.vlPretot + res.vlIcmSt + res.vlIpi).toFixed(2)}`);

    this.setText('res-cst-icms', res.nrSittribIcms || '-');
    this.setText('res-base-icms', `R$ ${res.vlIcmbc.toFixed(2)}`);
    this.setText('res-aliq-icms', `${res.vlPorIcm}%`);
    this.setText('res-val-icms', `R$ ${res.vlIcm.toFixed(2)}`);

    this.setText('res-cst-st', res.vlPorIcmSt > 0 ? res.nrSittribIcms : 'Sem ST');
    this.setText('res-base-st', `R$ ${res.vlIcmBcSt.toFixed(2)}`);
    this.setText('res-mva-st', `${res.vlPorIcmVaBcSt}%`);
    this.setText('res-val-st', `R$ ${res.vlIcmSt.toFixed(2)}`);

    this.setText('res-cst-ipi', res.nrSittribIpi || '-');
    this.setText('res-base-ipi', `R$ ${res.vlIpiBc.toFixed(2)}`);
    this.setText('res-aliq-ipi', `${res.vlPorIpi}%`);
    this.setText('res-val-ipi', `R$ ${res.vlIpi.toFixed(2)}`);

    this.setText('res-cst-pis', res.nrSittribPis || '-');
    this.setText('res-base-pis', `R$ ${res.vlPisBc.toFixed(2)}`);
    this.setText('res-aliq-pis', `${res.vlPorPis}%`);
    this.setText('res-val-pis', `R$ ${res.vlPis.toFixed(2)}`);

    this.setText('res-cst-cofins', res.nrSittribCofins || '-');
    this.setText('res-base-cofins', `R$ ${res.vlCofinsBc.toFixed(2)}`);
    this.setText('res-aliq-cofins', `${res.vlPorCofins}%`);
    this.setText('res-val-cofins', `R$ ${res.vlCofins.toFixed(2)}`);

    this.setText('res-val-ibs', `R$ ${res.vlIbsUf.toFixed(2)}`);
    this.setText('res-val-cbs', `R$ ${res.vlCbs.toFixed(2)}`);

    // 2. Resumo da Pirâmide
    this.setText('summary-icms-winner', res.memory.pyramidSummary.icmsWinner);
    this.setText('summary-ipi-winner', res.memory.pyramidSummary.ipiWinner);
    this.setText('summary-pis-winner', res.memory.pyramidSummary.pisWinner);
    this.setText('summary-cofins-winner', res.memory.pyramidSummary.cofinsWinner);

    // 3. Renderizar Lista de Etapas da Pirâmide
    this.renderHierarchySteps();

    // 4. Renderizar Memória de Fórmulas Matemáticas
    this.renderFormulas();

    // 5. Informações Complementares
    this.renderComplementaryInfo();

    // Rola suavemente até os resultados
    document.getElementById('sim-results-container')?.scrollIntoView({ behavior: 'smooth' });
  }

  private renderHierarchySteps() {
    const container = document.getElementById('hierarchy-steps-list');
    if (!container || !this.lastResult) return;

    const steps = this.lastResult.memory.hierarchySteps.filter(s => {
      if (this.activeTaxFilter === 'ALL') return true;
      return s.tax.toUpperCase() === this.activeTaxFilter.toUpperCase();
    });

    if (steps.length === 0) {
      container.innerHTML = `<div class="p-4 text-center text-sm text-gray-500">Nenhum evento registrado para o filtro ${this.activeTaxFilter}.</div>`;
      return;
    }

    container.innerHTML = steps.map((s) => {
      let badgeColor = 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 border-gray-300';
      let icon = '⚪';
      let statusText = 'Não Aplicada';

      if (s.applied) {
        badgeColor = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
        icon = '✅';
        statusText = 'Regra Vencedora';
      } else if (s.recordFound) {
        badgeColor = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
        icon = '⚠️';
        statusText = 'Encontrada / Ignorada';
      }

      return `
        <div class="p-4 rounded-xl border ${badgeColor} transition-all hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-base">${icon}</span>
              <span class="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">${s.tax}</span>
              <h4 class="font-bold text-sm text-gray-900 dark:text-white">${s.levelName}</h4>
              <span class="text-xs text-gray-500 dark:text-gray-400">[Tabela: <code>${s.tableSource}</code>]</span>
            </div>
            <p class="text-xs text-gray-600 dark:text-gray-300 ml-6">${s.reason}</p>
          </div>
          <div class="flex items-center gap-3 text-xs shrink-0 ml-6 md:ml-0">
            ${s.cstAfter ? `<div class="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-800 font-mono font-bold">CST: ${s.cstAfter}</div>` : ''}
            ${s.rate !== undefined && s.rate > 0 ? `<div class="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-800 font-mono font-bold">Alíq: ${s.rate}%</div>` : ''}
            ${s.reduction !== undefined && s.reduction > 0 ? `<div class="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-800 font-mono font-bold">Redução: ${s.reduction}%</div>` : ''}
            <span class="font-semibold ${s.applied ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}">${statusText}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  private renderFormulas() {
    const container = document.getElementById('formulas-trace-list');
    if (!container || !this.lastResult) return;

    const formulas = this.lastResult.memory.formulas;
    if (formulas.length === 0) {
      container.innerHTML = `<div class="p-4 text-center text-sm text-gray-500">Nenhuma fórmula registrada.</div>`;
      return;
    }

    container.innerHTML = formulas.map(f => `
      <div class="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">${f.tax}</span>
          <span class="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">Resultado: R$ ${f.result.toFixed(2)}</span>
        </div>
        <p class="text-xs font-semibold text-gray-800 dark:text-gray-200">${f.description}</p>
        <div class="text-[11px] font-mono p-2 rounded bg-slate-50 dark:bg-slate-950/70 border border-slate-200/60 dark:border-slate-800/80 space-y-0.5">
          <div class="text-gray-500">Fórmula: ${f.formula}</div>
          <div class="text-emerald-600 dark:text-emerald-400 font-bold">Cálculo: ${f.evaluated} = R$ ${f.result.toFixed(2)}</div>
        </div>
      </div>
    `).join('');
  }

  private renderComplementaryInfo() {
    const container = document.getElementById('complementary-info-list');
    if (!container || !this.lastResult) return;

    const infos = this.lastResult.memory.complementaryInfo;
    if (infos.length === 0) {
      container.innerHTML = `<p class="text-xs text-gray-400 italic">Nenhuma informação complementar adicional gerada para esta operação.</p>`;
      return;
    }

    container.innerHTML = infos.map(info => `
      <li class="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
        <span class="text-blue-500 mt-0.5">•</span>
        <div>
          <span class="font-semibold text-gray-900 dark:text-white">${info.text}</span>
          <span class="text-[10px] text-gray-400 block">[Origem: ${info.source}${info.id ? ` | Código ${info.id}` : ''}]</span>
        </div>
      </li>
    `).join('');
  }

  private exportSimulation() {
    if (!this.lastResult) {
      alert('Execute uma simulação antes de exportar!');
      return;
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.lastResult, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `simulacao_fiscal_${this.lastResult.fkProduto}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  private setText(id: string, text: string) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}
