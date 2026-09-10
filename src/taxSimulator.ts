/**
 * Controlador de Interface do Simulador Tributário NF-e
 * Gerencia inputs, conexão SQL Server, execução do TaxEngine e renderização da Memória de Cálculo
 */

import { TaxEngine } from './fiscal/taxEngine';
import type {
  SqlServerConfig,
  ItemFiscalInput,
  CabecalhoFiscalInput,
  CalculatedItemResult,
  SimulationPayload,
  HierarchyStep
} from './fiscal/types';

const STORAGE_KEY_SQL_CONFIG = 'comparador_sql_config';


interface PyramidLevelTemplate {
  levelNumber: number;
  levelName: string;
  tableSource: string;
  description: string;
  isBase?: boolean;
  isTop?: boolean;
}

const TAX_PYRAMID_TEMPLATES: Record<string, PyramidLevelTemplate[]> = {
  ICMS: [
    { levelNumber: 7, levelName: '7. Regra de Imposto Dinâmica', tableSource: 'TB_REGRAIMPOSTO', description: 'Regra fiscal customizada (prioridade máxima do FoxPro)', isTop: true },
    { levelNumber: 6, levelName: '6. Isenção Empresa Emitente', tableSource: 'TB_EMPRESAS', description: 'Tratamento de isenção vinculado ao cadastro da filial emitente' },
    { levelNumber: 5, levelName: '5. Isenção / Perfil do Cliente', tableSource: 'TB_CADUNICO', description: 'Tratamento de isenção ou CST específica cadastrada no cliente/destinatário' },
    { levelNumber: 4, levelName: '4. Cadastro do Produto', tableSource: 'TB_PRODUTOS', description: 'CST e parâmetros cadastrados diretamente no item' },
    { levelNumber: 3, levelName: '3. Exceção por Cliente', tableSource: 'TB_EXCECAOICMS', description: 'Exceção fiscal de ICMS cadastrada exclusivamente para este cliente' },
    { levelNumber: 2, levelName: '2. Exceção NCM por UF', tableSource: 'TB_CLAFISEXC', description: 'Exceção fiscal vinculada ao NCM da mercadoria para a UF da operação' },
    { levelNumber: 1, levelName: '1. CFOP Base', tableSource: 'TB_CFOP', description: 'Configuração geral de CST do CFOP (regra padrão / base da pirâmide)', isBase: true },
  ],
  'ICMS-ST': [
    { levelNumber: 4, levelName: '4. Regra de Imposto ST', tableSource: 'TB_REGRAIMPOSTO', description: 'Regra fiscal customizada de Substituição Tributária (sobreposição total)', isTop: true },
    { levelNumber: 3, levelName: '3. Protocolo / ST Estadual', tableSource: 'TB_SUBSTRIBUTARIA', description: 'MVA %, Alíquota ST e Redução ST cadastradas para o NCM e UF' },
    { levelNumber: 2, levelName: '2. Destino da Mercadoria', tableSource: 'TB_DESTINOMERCADORIA', description: 'Validação se o destino da operação calcula ICMS-ST' },
    { levelNumber: 1, levelName: '1. Configuração CFOP', tableSource: 'TB_CFOP', description: 'Liberação do CFOP para apuração de ST', isBase: true },
  ],
  IPI: [
    { levelNumber: 6, levelName: '6. Regra de Imposto Dinâmica', tableSource: 'TB_REGRAIMPOSTO', description: 'Regra fiscal customizada de IPI (prioridade máxima do FoxPro)', isTop: true },
    { levelNumber: 5, levelName: '5. Isenção Empresa', tableSource: 'TB_EMPRESAS', description: 'Isenção de IPI no cadastro da filial emitente' },
    { levelNumber: 4, levelName: '4. Isenção Cliente', tableSource: 'TB_CADUNICO', description: 'Isenção de IPI no cadastro do cliente/destinatário' },
    { levelNumber: 3, levelName: '3. Produto', tableSource: 'TB_PRODUTOS', description: 'CST ou alíquota/valor por unidade definidos no produto' },
    { levelNumber: 2, levelName: '2. NCM / Classificação Fiscal', tableSource: 'TB_CLAFIS', description: 'Alíquota e CST de IPI na classificação fiscal NCM' },
    { levelNumber: 1, levelName: '1. CFOP Base', tableSource: 'TB_CFOP', description: 'CST inicial de IPI definida no cadastro de CFOP', isBase: true },
  ],
  PIS: [
    { levelNumber: 6, levelName: '6. Regra de Imposto Dinâmica', tableSource: 'TB_REGRAIMPOSTO', description: 'Regra fiscal customizada de PIS (prioridade máxima do FoxPro)', isTop: true },
    { levelNumber: 5, levelName: '5. Isenção Empresa Emitente', tableSource: 'TB_EMPRESAS', description: 'Isenção de PIS da filial emitente' },
    { levelNumber: 4, levelName: '4. Isenção Cliente', tableSource: 'TB_CADUNICO', description: 'Isenção de PIS do cliente/destinatário' },
    { levelNumber: 3, levelName: '3. Cadastro do Produto', tableSource: 'TB_PRODUTOS', description: 'CST de PIS parametrizada no cadastro do item' },
    { levelNumber: 2, levelName: '2. Exceção NCM / UF', tableSource: 'TB_CLAFISEXC', description: 'Exceção de PIS configurada por NCM e UF' },
    { levelNumber: 1, levelName: '1. CFOP Base', tableSource: 'TB_CFOP', description: 'CST inicial de PIS definida no CFOP', isBase: true },
  ],
  COFINS: [
    { levelNumber: 6, levelName: '6. Regra de Imposto Dinâmica', tableSource: 'TB_REGRAIMPOSTO', description: 'Regra fiscal customizada de COFINS (prioridade máxima do FoxPro)', isTop: true },
    { levelNumber: 5, levelName: '5. Isenção Empresa Emitente', tableSource: 'TB_EMPRESAS', description: 'Isenção de COFINS da filial emitente' },
    { levelNumber: 4, levelName: '4. Isenção Cliente', tableSource: 'TB_CADUNICO', description: 'Isenção de COFINS do cliente/destinatário' },
    { levelNumber: 3, levelName: '3. Cadastro do Produto', tableSource: 'TB_PRODUTOS', description: 'CST de COFINS parametrizada no cadastro do item' },
    { levelNumber: 2, levelName: '2. Exceção NCM / UF', tableSource: 'TB_CLAFISEXC', description: 'Exceção de COFINS configurada por NCM e UF' },
    { levelNumber: 1, levelName: '1. CFOP Base', tableSource: 'TB_CFOP', description: 'CST inicial de COFINS definida no CFOP', isBase: true },
  ]
};

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
  private activePyramidTax: string = 'ALL';

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
    // Limpa quaisquer avisos residuais de validação em tela
    const infoProdInit = document.getElementById('sim-prod-info');
    if (infoProdInit) infoProdInit.textContent = '';
    const infoCliInit = document.getElementById('sim-cli-info');
    if (infoCliInit) infoCliInit.textContent = '';

    const inputSearchProd = document.getElementById('search-prod-input') as HTMLInputElement;
    let searchDebounce: any = null;
    inputSearchProd?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        this.searchProducts(inputSearchProd.value.trim());
      }, 300);
    });

    // Validação antecipada de produto removida (valida apenas ao Simular)

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

    // Validação antecipada de cliente removida (valida apenas ao Simular)

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

    // Toggle para o log sequencial linear
    const btnToggleLinear = document.getElementById('btn-toggle-linear-steps');
    const linearWrapper = document.getElementById('linear-steps-wrapper');
    const linearToggleIcon = document.getElementById('linear-steps-toggle-icon');
    btnToggleLinear?.addEventListener('click', () => {
      if (linearWrapper) {
        const isHidden = linearWrapper.classList.contains('hidden');
        if (isHidden) {
          linearWrapper.classList.remove('hidden');
          if (linearToggleIcon) linearToggleIcon.textContent = '▲ Recolher';
        } else {
          linearWrapper.classList.add('hidden');
          if (linearToggleIcon) linearToggleIcon.textContent = '▼ Expandir';
        }
      }
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
             data-prod-id="${p.PK_ID}" data-prod-desc="${p.DS_MODELO || p.DS_PRODUTO || p.DS_NOME || ''}">
          <div class="min-w-0 pr-3">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-xs text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded shrink-0">${p.PK_ID}</span>
              <span class="text-xs font-bold text-gray-900 dark:text-white truncate">${p.DS_MODELO || p.DS_PRODUTO || p.DS_NOME || '(Sem descrição)'}</span>
            </div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              NCM: <strong class="font-mono text-gray-700 dark:text-gray-300">${p.FK_CLAFIS || 'N/A'}</strong> | CST ICMS: <strong class="font-mono text-gray-700 dark:text-gray-300">${p.CD_SITTRIBUTARIA || p.NR_SITTRIB || 'não informado'}</strong>
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

  public async validateAndPreviewProduct(_code?: string) {
    const infoEl = document.getElementById('sim-prod-info');
    if (infoEl) infoEl.textContent = '';
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
             data-cli-id="${c.PK_ID}" data-cli-nome="${c.DS_FANTASIA || c.DS_RAZAO || c.DS_NOME || ''}" data-cli-uf="${c.DS_UF || ''}">
          <div class="min-w-0 pr-3">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-xs text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded shrink-0">ID: ${c.PK_ID}</span>
              <span class="text-xs font-bold text-gray-900 dark:text-white truncate">${c.DS_FANTASIA || c.DS_RAZAO || c.DS_NOME || '(Sem nome)'}</span>
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

  public async validateAndPreviewClient(_code?: string) {
    const infoEl = document.getElementById('sim-cli-info');
    if (infoEl) infoEl.textContent = '';
  }

  private getInputs(): { item: ItemFiscalInput; cabecalho: CabecalhoFiscalInput } {
    const read = (id: string, label: string): string => {
      const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      const value = element?.value.trim() ?? '';
      if (!value) throw new Error(`Informe ${label}. O simulador não substitui este campo por um valor padrão.`);
      return value;
    };
    const numeric = (id: string, label: string, integer = false): number => {
      const value = Number(read(id, label));
      if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
        throw new Error(`${label} deve ser ${integer ? 'um número inteiro' : 'numérico'}.`);
      }
      return value;
    };
    const optionalAmount = (id: string, label: string): number => {
      const element = document.getElementById(id) as HTMLInputElement | null;
      const raw = element?.value.trim() ?? '';
      if (!raw) return 0;
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`${label} deve ser numérico.`);
      return value;
    };

    const fkProduto = read('sim-item-prod', 'o código do produto');
    const fkCfop = numeric('sim-item-cfop', 'o CFOP', true);
    const qtMovimento = numeric('sim-item-qtd', 'a quantidade');
    const vlUnitario = numeric('sim-item-unit', 'o valor unitário');
    const totalRaw = (document.getElementById('sim-item-total') as HTMLInputElement | null)?.value.trim() ?? '';
    const vlTotal = totalRaw ? Number(totalRaw) : undefined;
    if (vlTotal !== undefined && !Number.isFinite(vlTotal)) throw new Error('O valor total deve ser numérico.');

    const vlFrete = optionalAmount('sim-item-frete', 'o frete');
    const vlSeguro = optionalAmount('sim-item-seguro', 'o seguro');
    const vlDespesas = optionalAmount('sim-item-despesas', 'as outras despesas');
    const vlDesconto = optionalAmount('sim-item-desconto', 'o desconto');

    const tipo = read('sim-cab-tipo', 'o tipo de movimento').toUpperCase() as 'S' | 'E';
    if (tipo !== 'S' && tipo !== 'E') throw new Error('O tipo de movimento deve ser S ou E.');
    const fkEmpresa = read('sim-cab-empresa', 'a empresa emitente');
    const fkCadunico = numeric('sim-cab-cliente', 'o cliente/destinatário', true);
    const dsUf = read('sim-cab-uf', 'a UF de destino/origem').toUpperCase();
    if (!/^[A-Z]{2}$/.test(dsUf)) throw new Error('A UF deve conter duas letras, como SP ou MG.');
    const tgRegime = numeric('sim-cab-regime', 'o regime emitente', true);
    const dtEmissao = (document.getElementById('sim-cab-emissao') as HTMLInputElement | null)?.value.trim() ?? '';
    if (dtEmissao && !/^\d{4}-\d{2}-\d{2}$/.test(dtEmissao)) throw new Error('A data de emissão deve estar no formato AAAA-MM-DD.');

    return {
      item: {
        fkProduto,
        fkCfop,
        qtMovimento,
        vlUnitario,
        vlTotal,
        vlFrete,
        vlSeguro,
        vlDespesas,
        vlDesconto
      },
      cabecalho: {
        tipo,
        fkEmpresa,
        fkCadunico,
        dsUf,
        tgRegime,
        ...(dtEmissao ? { dtEmissao } : {})
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
        const destMerRaw = (document.getElementById('sim-item-destmer') as HTMLSelectElement | null)?.value.trim() ?? '';
        const destMer = Number(destMerRaw);
        if (!Number.isInteger(destMer)) {
          throw new Error('Informe o destino da mercadoria. O simulador não usa destino padrão.');
        }
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
              tipo: cabecalho.tipo,
              destMer,
              dtEmissao: cabecalho.dtEmissao
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
          this.showModalAlert('Não foi possível realizar o cálculo no SQL Server', data.error || 'Erro ao consultar os dados tributários do banco de dados.', 'error');
          return;
        }
      } else {
        this.showModalAlert(
          'Conexão SQL Server necessária',
          'O modo offline usava CSTs e alíquotas de exemplo. Como este simulador precisa reproduzir o NFE_CALCULARITEM.PRG, conecte à mesma base usada pelo ERP para executar o cálculo.',
          'error'
        );
        return;
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
      this.showModalAlert('Erro na Simulação', `Ocorreu um erro durante o cálculo tributário:\n\n${err.message}`, 'error');
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

    this.setText('res-cst-icms', res.nrSittribIcms || '');
    this.setText('res-base-icms', `R$ ${res.vlIcmbc.toFixed(2)}`);
    this.setText('res-aliq-icms', `${res.vlPorIcm}%`);
    this.setText('res-val-icms', `R$ ${res.vlIcm.toFixed(2)}`);

    this.setText('res-cst-st', res.vlPorIcmSt > 0 ? res.nrSittribIcms : 'Sem ST');
    this.setText('res-base-st', `R$ ${res.vlIcmBcSt.toFixed(2)}`);
    this.setText('res-mva-st', `${res.vlPorIcmVaBcSt}%`);
    this.setText('res-val-st', `R$ ${res.vlIcmSt.toFixed(2)}`);

    this.setText('res-cst-ipi', res.nrSittribIpi || '');
    this.setText('res-base-ipi', `R$ ${res.vlIpiBc.toFixed(2)}`);
    this.setText('res-aliq-ipi', `${res.vlPorIpi}%`);
    this.setText('res-val-ipi', `R$ ${res.vlIpi.toFixed(2)}`);

    this.setText('res-cst-pis', res.nrSittribPis || '');
    this.setText('res-base-pis', `R$ ${res.vlPisBc.toFixed(2)}`);
    this.setText('res-aliq-pis', `${res.vlPorPis}%`);
    this.setText('res-val-pis', `R$ ${res.vlPis.toFixed(2)}`);

    this.setText('res-cst-cofins', res.nrSittribCofins || '');
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

    // 3. Renderizar Pirâmide Visual de Decisão Fiscal (inicia por padrão na Visão Geral)
    this.activePyramidTax = 'ALL';
    this.renderPyramidTabs();
    this.renderTaxPyramid(this.activePyramidTax);

    // 4. Renderizar Lista de Etapas Lineares (Log Sequencial Opcional)
    this.renderHierarchySteps();

    // 5. Renderizar Memória de Fórmulas Matemáticas
    this.renderFormulas();

    // 6. Informações Complementares
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


  private renderPyramidTabs() {
    const tabsContainer = document.getElementById('tax-pyramid-tabs');
    if (!tabsContainer || !this.lastResult) return;
    const res = this.lastResult;

    const taxes = [
      {
        id: 'ALL',
        label: 'Visão Geral',
        icon: '✨',
        badge: 'Todos os Tributos',
        winner: 'Comparativo'
      },
      {
        id: 'ICMS',
        label: 'ICMS Próprio',
        icon: '🏛️',
        badge: `CST ${res.nrSittribIcms} | ${res.vlPorIcm}%`,
        winner: res.memory.pyramidSummary.icmsWinner
      },
      {
        id: 'ICMS-ST',
        label: 'ICMS-ST',
        icon: '🛡️',
        badge: res.vlPorIcmSt > 0 ? `ST: ${res.vlPorIcmSt}%` : 'Sem ST',
        winner: res.memory.pyramidSummary.stWinner || 'Sem ST'
      },
      {
        id: 'IPI',
        label: 'IPI',
        icon: '⚙️',
        badge: `CST ${res.nrSittribIpi} | ${res.vlPorIpi}%`,
        winner: res.memory.pyramidSummary.ipiWinner
      },
      {
        id: 'PIS',
        label: 'PIS',
        icon: '💧',
        badge: `CST ${res.nrSittribPis} | ${res.vlPorPis}%`,
        winner: res.memory.pyramidSummary.pisWinner
      },
      {
        id: 'COFINS',
        label: 'COFINS',
        icon: '📊',
        badge: `CST ${res.nrSittribCofins} | ${res.vlPorCofins}%`,
        winner: res.memory.pyramidSummary.cofinsWinner
      }
    ];

    tabsContainer.innerHTML = taxes.map(t => {
      const isActive = this.activePyramidTax === t.id;
      const activeClasses = isActive
        ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400/40 font-bold'
        : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/60 border border-slate-200 dark:border-slate-700';

      return `
        <button type="button" data-tax-tab="${t.id}" class="pyramid-tab-btn px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-2 cursor-pointer shrink-0 ${activeClasses}">
          <span class="text-sm">${t.icon}</span>
          <span>${t.label}</span>
          <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
            ${t.badge}
          </span>
        </button>
      `;
    }).join('');

    tabsContainer.querySelectorAll('.pyramid-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const taxId = target.getAttribute('data-tax-tab') || 'ALL';
        this.activePyramidTax = taxId;
        this.renderPyramidTabs();
        this.renderTaxPyramid(taxId);
      });
    });
  }

  private renderTaxPyramid(taxName: string) {
    const container = document.getElementById('tax-pyramid-container');
    const inspector = document.getElementById('pyramid-detail-inspector');
    if (inspector) inspector.classList.add('hidden');
    if (!container || !this.lastResult) return;

    if (taxName === 'ALL') {
      this.renderAllPyramidsOverview(container);
      return;
    }

    const tiers = TAX_PYRAMID_TEMPLATES[taxName] || TAX_PYRAMID_TEMPLATES['ICMS'];
    const res = this.lastResult;
    const taxSteps = res.memory.hierarchySteps.filter(s => s.tax === taxName);

    // Identificar resumo do imposto
    let taxVal = 0;
    let taxCst = '';
    let taxAliq = 0;
    let taxBase = 0;

    if (taxName === 'ICMS') {
      taxVal = res.vlIcm;
      taxCst = res.nrSittribIcms;
      taxAliq = res.vlPorIcm;
      taxBase = res.vlIcmbc;
    } else if (taxName === 'ICMS-ST') {
      taxVal = res.vlIcmSt;
      taxCst = res.vlPorIcmSt > 0 ? res.nrSittribIcms : 'Sem ST';
      taxAliq = res.vlPorIcmSt;
      taxBase = res.vlIcmBcSt;
    } else if (taxName === 'IPI') {
      taxVal = res.vlIpi;
      taxCst = res.nrSittribIpi;
      taxAliq = res.vlPorIpi;
      taxBase = res.vlIpiBc;
    } else if (taxName === 'PIS') {
      taxVal = res.vlPis;
      taxCst = res.nrSittribPis;
      taxAliq = res.vlPorPis;
      taxBase = res.vlPisBc;
    } else if (taxName === 'COFINS') {
      taxVal = res.vlCofins;
      taxCst = res.nrSittribCofins;
      taxAliq = res.vlPorCofins;
      taxBase = res.vlCofinsBc;
    }

    const winnerStep = taxSteps.find(s => s.isWinner) || taxSteps.filter(s => s.applied).slice(-1)[0];
    const totalTiers = tiers.length;

    let html = `
      <div class="space-y-5 animate-in fade-in duration-200">
        
        <!-- Header do Imposto Ativo com Métricas -->
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl shrink-0">
              ${taxName === 'ICMS' ? '🏛️' : taxName === 'ICMS-ST' ? '🛡️' : taxName === 'IPI' ? '⚙️' : taxName === 'PIS' ? '💧' : '📊'}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-extrabold text-sm text-gray-900 dark:text-white">${taxName}</h4>
                <span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  CST Final: ${taxCst || '-'}
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                ${winnerStep ? `Regra vencedora: <strong class="text-emerald-600 dark:text-emerald-400">${winnerStep.levelName} (${winnerStep.tableSource})</strong>` : 'Nenhuma regra vencedora aplicada'}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-4 text-xs font-mono shrink-0 bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <div>
              <span class="text-[10px] text-gray-400 block uppercase font-sans">Base</span>
              <strong class="text-gray-800 dark:text-slate-200">R$ ${taxBase.toFixed(2)}</strong>
            </div>
            <div class="h-6 w-px bg-slate-200 dark:bg-slate-800"></div>
            <div>
              <span class="text-[10px] text-gray-400 block uppercase font-sans">Alíquota</span>
              <strong class="text-gray-800 dark:text-slate-200">${taxAliq}%</strong>
            </div>
            <div class="h-6 w-px bg-slate-200 dark:bg-slate-800"></div>
            <div>
              <span class="text-[10px] text-gray-400 block uppercase font-sans">Imposto Final</span>
              <strong class="text-emerald-600 dark:text-emerald-400 font-bold text-sm">R$ ${taxVal.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        <!-- O Desenho da Pirâmide Escalonada (Degraus Geométricos) -->
        <div class="space-y-2 py-2 max-w-4xl mx-auto">
    `;

    tiers.forEach((tier, index) => {
      // Largura proporcional centralizada: do topo (56%) até a base (100%)
      const widthPercent = totalTiers > 1
        ? Math.round(56 + (44 * index) / (totalTiers - 1))
        : 100;

      // Localiza o step correspondente
      const step = taxSteps.find(s => s.levelNumber === tier.levelNumber || s.levelName?.startsWith(`${tier.levelNumber}.`));

      const isWinner = step?.isWinner || (winnerStep && step && step === winnerStep);
      const isApplied = step?.applied && !isWinner;
      const isBypassed = step?.status === 'bypassed_exemption' || (!step?.applied && step?.reason?.toLowerCase().includes('isenta'));

      let tierBg = '';
      let badgeHtml = '';
      let statusIcon = '';

      if (isWinner) {
        tierBg = 'bg-gradient-to-r from-emerald-500/25 via-emerald-600/30 to-teal-500/25 border-2 border-emerald-500 shadow-xl shadow-emerald-500/20 ring-4 ring-emerald-500/20 text-gray-900 dark:text-white scale-[1.01]';
        statusIcon = '🎯';
        badgeHtml = `
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="flex h-2 w-2 relative">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500 text-white shadow-xs">
              🎯 Regra Vencedora
            </span>
          </div>
        `;
      } else if (isApplied) {
        tierBg = 'bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/40 text-amber-900 dark:text-amber-200 hover:bg-amber-500/15';
        statusIcon = '🔄';
        badgeHtml = `
          <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
            Superada
          </span>
        `;
      } else if (isBypassed) {
        tierBg = 'bg-purple-500/10 dark:bg-purple-500/10 border border-purple-500/30 text-purple-900 dark:text-purple-300 hover:bg-purple-500/15';
        statusIcon = '⛔';
        badgeHtml = `
          <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 shrink-0">
            Ignorada
          </span>
        `;
      } else {
        tierBg = 'bg-slate-100/70 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700/60 text-gray-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600';
        statusIcon = '⚪';
        badgeHtml = `
          <span class="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-gray-500 dark:text-gray-400 shrink-0">
            Sem Registro
          </span>
        `;
      }

      html += `
        <div class="pyramid-tier mx-auto p-3 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-lg ${tierBg}"
             style="width: ${widthPercent}%; min-width: min(100%, 380px);"
             data-tier-level="${tier.levelNumber}"
             title="Clique para inspecionar o nível ${tier.levelName}">
          
          <!-- Linha Superior: Ícone, Nível, Nome da Regra e Badge de Status -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0 overflow-hidden">
              <span class="text-sm shrink-0">${statusIcon}</span>
              <span class="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-900/10 dark:bg-black/40 shrink-0">
                ${tier.isTop ? '🔺 TOPO' : tier.isBase ? '🔻 BASE' : `NÍVEL ${tier.levelNumber}`}
              </span>
              <span class="font-bold text-xs sm:text-sm truncate text-gray-900 dark:text-gray-100">${tier.levelName}</span>
              <code class="text-[10px] text-gray-500 dark:text-gray-400 font-mono shrink-0 hidden sm:inline-block">[${tier.tableSource}]</code>
            </div>

            <div class="shrink-0 flex items-center">
              ${badgeHtml}
            </div>
          </div>

          <!-- Linha Inferior: Justificativa/Descrição e Tags de CST / Alíquota -->
          <div class="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-black/5 dark:border-white/5">
            <p class="text-[11px] opacity-80 truncate min-w-0 flex-1" title="${step?.reason || tier.description}">
              ${step?.reason || tier.description}
            </p>

            ${(step?.cstAfter || (step?.rate !== undefined && step.rate > 0)) ? `
              <div class="flex items-center gap-1.5 shrink-0 ml-2">
                ${step?.cstAfter ? `<span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-950 text-gray-800 dark:text-slate-200 border border-slate-300 dark:border-slate-800">CST: ${step.cstAfter}</span>` : ''}
                ${step?.rate !== undefined && step.rate > 0 ? `<span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">Alíq: ${step.rate}%</span>` : ''}
              </div>
            ` : ''}
          </div>

        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach click listeners to inspect each tier
    container.querySelectorAll('.pyramid-tier').forEach(el => {
      el.addEventListener('click', () => {
        const lvl = parseInt(el.getAttribute('data-tier-level') || '0', 10);
        const tier = tiers.find(t => t.levelNumber === lvl);
        const step = taxSteps.find(s => s.levelNumber === lvl || s.levelName?.startsWith(`${lvl}.`));
        if (tier) {
          this.inspectPyramidLevel(tier, step);
        }
      });
    });
  }

  private inspectPyramidLevel(tier: PyramidLevelTemplate, step?: HierarchyStep) {
    const inspector = document.getElementById('pyramid-detail-inspector');
    if (!inspector || !this.lastResult) return;
    const res = this.lastResult;

    inspector.classList.remove('hidden');

    const isWinner = step?.isWinner;
    const isApplied = step?.applied && !isWinner;
    const isBypassed = step?.status === 'bypassed_exemption';

    let statusBadge = '';
    if (isWinner) {
      statusBadge = `<span class="px-2.5 py-1 rounded-md text-xs font-black uppercase bg-emerald-500 text-white shadow-xs">🎯 Regra Vencedora (Aplicada no Cálculo)</span>`;
    } else if (isApplied) {
      statusBadge = `<span class="px-2.5 py-1 rounded-md text-xs font-bold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">🔄 Encontrada mas Substituída</span>`;
    } else if (isBypassed) {
      statusBadge = `<span class="px-2.5 py-1 rounded-md text-xs font-bold uppercase bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30">⛔ Ignorada por Isenção Prévia</span>`;
    } else {
      statusBadge = `<span class="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-gray-500 dark:text-gray-400">⚪ Sem Registro no SQL Server</span>`;
    }

    inspector.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between border-b border-blue-200/60 dark:border-blue-900/40 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-base">🔍</span>
            <h4 class="font-extrabold text-sm text-gray-900 dark:text-white">
              Inspeção do Nível: <span class="text-blue-600 dark:text-blue-400">${tier.levelName}</span>
            </h4>
            <span class="font-mono text-xs text-gray-500 dark:text-gray-400">[Tabela: <code>${tier.tableSource}</code>]</span>
          </div>
          <div class="flex items-center gap-2">
            ${statusBadge}
            <button id="btn-close-pyramid-inspector" type="button" class="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Fechar inspeção">
              ✕
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          
          <div class="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span class="text-[10px] text-gray-400 uppercase font-bold block">Tabela de Consulta SQL</span>
            <div class="font-mono font-bold text-gray-800 dark:text-slate-200 text-xs">${tier.tableSource}</div>
            <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">${tier.description}</p>
          </div>

          <div class="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span class="text-[10px] text-gray-400 uppercase font-bold block">Valores Capturados</span>
            <div class="flex items-center gap-3 mt-1 font-mono text-xs">
              <div>CST: <strong class="text-blue-600 dark:text-blue-400">${step?.cstAfter || 'N/A'}</strong></div>
              <div>Alíq: <strong class="text-emerald-600 dark:text-emerald-400">${step?.rate !== undefined ? `${step.rate}%` : 'N/A'}</strong></div>
              ${step?.reduction ? `<div>Redução: <strong class="text-amber-600 dark:text-amber-400">${step.reduction}%</strong></div>` : ''}
            </div>
            <div class="text-[10px] text-gray-400 mt-1">Status: ${step?.applied ? 'Aplicado' : 'Não Aplicado'}</div>
          </div>

          <div class="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span class="text-[10px] text-gray-400 uppercase font-bold block">Chaves de Busca na Base</span>
            <div class="text-[11px] font-mono text-gray-600 dark:text-gray-300 space-y-0.5">
              <div>Produto: <strong>${res.fkProduto}</strong></div>
              <div>CFOP: <strong>${res.fkCfop}</strong></div>
            </div>
          </div>

        </div>

        <div class="p-3 rounded-lg bg-blue-100/50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs">
          <span class="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-300 block mb-0.5">Justificativa da Decisão Fiscal (Regra FoxPro)</span>
          <p class="text-gray-800 dark:text-slate-200 leading-relaxed font-medium">
            ${step?.reason || 'Nenhum registro correspondente foi localizado nesta tabela do SQL Server durante a execução do cálculo. O motor de cálculo seguiu para o próximo nível da pirâmide.'}
          </p>
        </div>
      </div>
    `;

    inspector.querySelector('#btn-close-pyramid-inspector')?.addEventListener('click', () => {
      inspector.classList.add('hidden');
    });

    inspector.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private renderAllPyramidsOverview(container: HTMLElement) {
    if (!this.lastResult) return;
    const res = this.lastResult;
    const taxes = ['ICMS', 'ICMS-ST', 'IPI', 'PIS', 'COFINS'];

    container.innerHTML = `
      <div class="space-y-4 animate-in fade-in duration-200">
        <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
          <span>Visão Geral Comparativa: Veja o nível vencedor em cada um dos 5 impostos.</span>
          <span class="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">Clique no card para abrir a pirâmide completa</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${taxes.map(taxName => {
            const tiers = TAX_PYRAMID_TEMPLATES[taxName] || [];
            const taxSteps = res.memory.hierarchySteps.filter(s => s.tax === taxName);
            const winnerStep = taxSteps.find(s => s.isWinner) || taxSteps.filter(s => s.applied).slice(-1)[0];
            const totalTiers = tiers.length;

            let taxVal = 0;
            let taxCst = '';
            if (taxName === 'ICMS') { taxVal = res.vlIcm; taxCst = res.nrSittribIcms; }
            else if (taxName === 'ICMS-ST') { taxVal = res.vlIcmSt; taxCst = res.vlPorIcmSt > 0 ? res.nrSittribIcms : 'Sem ST'; }
            else if (taxName === 'IPI') { taxVal = res.vlIpi; taxCst = res.nrSittribIpi; }
            else if (taxName === 'PIS') { taxVal = res.vlPis; taxCst = res.nrSittribPis; }
            else if (taxName === 'COFINS') { taxVal = res.vlCofins; taxCst = res.nrSittribCofins; }

            return `
              <div class="overview-tax-card p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer space-y-3"
                   data-select-tax="${taxName}">
                
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">${taxName === 'ICMS' ? '🏛️' : taxName === 'ICMS-ST' ? '🛡️' : taxName === 'IPI' ? '⚙️' : taxName === 'PIS' ? '💧' : '📊'}</span>
                    <h4 class="font-extrabold text-sm text-gray-900 dark:text-white">${taxName}</h4>
                  </div>
                  <span class="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">R$ ${taxVal.toFixed(2)}</span>
                </div>

                <!-- Mini Pirâmide -->
                <div class="py-2 space-y-1 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  ${tiers.map((tier, idx) => {
                    const widthPct = Math.round(50 + (50 * idx) / (totalTiers - 1));
                    const step = taxSteps.find(s => s.levelNumber === tier.levelNumber || s.levelName?.startsWith(`${tier.levelNumber}.`));
                    const isWinner = step?.isWinner || (winnerStep && step && step === winnerStep);

                    let barColor = 'bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500';
                    if (isWinner) {
                      barColor = 'bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400';
                    } else if (step?.applied) {
                      barColor = 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40';
                    }

                    return `
                      <div class="mx-auto text-[10px] py-0.5 px-2 rounded flex items-center justify-between transition-all ${barColor}"
                           style="width: ${widthPct}%;">
                        <span class="truncate font-mono">${tier.levelNumber}. ${tier.tableSource}</span>
                        ${isWinner ? '<span class="text-[9px] font-black shrink-0">🎯 VENCEDOR</span>' : ''}
                      </div>
                    `;
                  }).join('')}
                </div>

                <div class="text-xs pt-1 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-gray-500 dark:text-gray-400">
                  <span>CST: <strong class="text-gray-800 dark:text-slate-200 font-mono">${taxCst || '-'}</strong></span>
                  <span class="text-[11px] text-blue-600 dark:text-blue-400 font-medium">Ver Pirâmide ➜</span>
                </div>

              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.overview-tax-card').forEach(card => {
      card.addEventListener('click', () => {
        const selected = card.getAttribute('data-select-tax') || 'ICMS';
        this.activePyramidTax = selected;
        this.renderPyramidTabs();
        this.renderTaxPyramid(selected);
      });
    });
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
      this.showModalAlert('Aviso', 'Execute uma simulação antes de exportar os dados!', 'warning');
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

  /**
   * Exibe um modal moderno e elegante de aviso/erro no padrão escuro da aplicação
   */
  private showModalAlert(title: string, message: string, type: 'error' | 'warning' | 'info' = 'error') {
    let modal = document.getElementById('custom-tax-alert-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'custom-tax-alert-modal';
      document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150';

    const iconSvg = type === 'error'
      ? `<div class="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
           <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
           </svg>
         </div>`
      : `<div class="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
           <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
           </svg>
         </div>`;

    modal.innerHTML = `
      <div class="bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150" onclick="event.stopPropagation()">
        <div class="p-6">
          <div class="flex items-start gap-4">
            ${iconSvg}
            <div class="flex-1 min-w-0 pt-0.5">
              <h3 class="text-base font-bold text-white tracking-tight">${title}</h3>
              <p class="text-xs text-slate-300 mt-2.5 whitespace-pre-line leading-relaxed">${message}</p>
            </div>
          </div>
        </div>
        <div class="px-6 py-3.5 bg-slate-950/60 border-t border-slate-800/80 flex justify-end">
          <button id="btn-custom-alert-ok" type="button" class="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 rounded-xl shadow-md transition-all cursor-pointer">
            Entendido
          </button>
        </div>
      </div>
    `;

    const closeModal = () => {
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
      document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        closeModal();
      }
    };

    modal.onclick = closeModal;
    const btnOk = modal.querySelector('#btn-custom-alert-ok');
    btnOk?.addEventListener('click', closeModal);
    document.addEventListener('keydown', onKeyDown);
  }
}
