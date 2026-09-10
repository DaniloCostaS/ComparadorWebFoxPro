/**
 * Tipos e interfaces para o Simulador de Cálculo NF-e e Memória de Cálculo Fiscal
 */

export interface SqlServerConfig {
  server: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  instanceName?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  connectTimeout?: number;
}

export interface ItemFiscalInput {
  // Identificação principal
  fkProduto: string;
  fkCfop: number;
  qtMovimento: number;
  vlUnitario: number;
  vlTotal?: number; // Se vazio, qtMovimento * vlUnitario

  // Valores acessórios
  vlFrete?: number;
  vlSeguro?: number;
  vlDespesas?: number;
  vlDesconto?: number;

  // Parâmetros do item
  tgOrigemImp?: number; // 0=Nacional, 1=Importação Direta, 2=Importado Mercado Interno
  tgTransferencia?: number; // 0=Não, 1=Sim
  tgEditado?: number; // 1=Liberar dados para edição manual

  // Lote / FCI opcional
  nrLote?: string;
}

export interface CabecalhoFiscalInput {
  tipo: 'S' | 'E'; // (S)aída ou (E)ntrada
  fkEmpresa: string;
  fkCadunico: number; // Código do Cliente / Fornecedor
  dsUf: string; // UF de Destino (Saída) ou Origem (Entrada)
  dtEmissao?: string; // YYYY-MM-DD
  tgRegime?: number; // 1=Tributação Normal (CRT=3), 2=Simples Nacional (CRT=1/2/4)
  tgOperacao?: number; // 1=Interna, 2=Interestadual, 3=Exterior
  tgImpressao?: string; // 'S' ou 'N'
  vlPorRedCompraGov?: number; // Redutor compras governamentais
  tgIncentivoIpi?: number;
  tgIncentivoPis?: number;
  tgIncentivoCofins?: number;
}

export interface HierarchyStep {
  tax: 'ICMS' | 'ICMS-ST' | 'IPI' | 'PIS' | 'COFINS' | 'DIFAL' | 'IBS/CBS' | 'IS';
  levelName: string; // Ex: '1. CFOP', '2. Exceção NCM UF', '3. Exceção Cliente', etc.
  tableSource: string; // Ex: 'TB_CFOP', 'TB_CLAFISEXC', 'TB_EXCECAOICMS', 'TB_PRODUTOS', 'TB_EMPRESAS', 'TB_REGRAIMPOSTO'
  recordFound: boolean;
  applied: boolean;
  cstBefore?: string;
  cstAfter?: string;
  rate?: number;
  reduction?: number;
  reason: string;
  details?: Record<string, any>;
}

export interface FormulaTrace {
  tax: string;
  description: string;
  formula: string;
  evaluated: string;
  result: number;
}

export interface TaxCalculationMemory {
  hierarchySteps: HierarchyStep[];
  formulas: FormulaTrace[];
  complementaryInfo: Array<{ id?: number; text: string; source: string }>;
  systemParameters: Record<string, any>;
  pyramidSummary: {
    icmsWinner: string;
    ipiWinner: string;
    pisWinner: string;
    cofinsWinner: string;
    stWinner?: string;
  };
}

export interface CalculatedItemResult {
  // Dados de entrada processados
  fkProduto: string;
  dsProduto?: string;
  fkCfop: number;
  qtMovimento: number;
  vlUnitario: number;
  vlPretot: number;
  vlBasecalc: number;

  // ICMS Normal
  nrSittribIcms: string; // CST ou CSOSN (ex: '000', '102', '020')
  vlIcmbc: number;
  vlPorIcm: number;
  vlPorIcmRbbc: number;
  vlIcm: number;
  vlPorIcmDeson: number;
  vlIcmDeson: number;
  fkMotivoDesonIcms: number;

  // ICMS Simples Nacional
  vlPorIcmSn: number;
  vlPorCredIcmSn: number;

  // ICMS FCP
  vlIcmFcpBc: number;
  vlPorIcmFcp: number;
  vlIcmFcp: number;

  // ICMS Diferimento
  vlPorIcmDed: number;
  vlIcmBcDed: number;
  vlIcmDed: number;

  // ICMS Substituição Tributária (ST)
  vlIcmBcSt: number;
  vlPorIcmVaBcSt: number; // MVA %
  vlPorIcmSt: number; // Alíquota ST %
  vlPorIcmRbbcSt: number; // Redução ST %
  vlIcmSt: number;
  vlBaseArbitrada: number;
  nrCest: string;

  // FCP ST
  vlIcmFcpBcSt: number;
  vlPorIcmFcpSt: number;
  vlIcmFcpSt: number;

  // DIFAL Interestadual
  vlIcmBcUfDest: number;
  vlPorIcmUfDest: number;
  vlPorIcmUfEnv: number;
  vlPorIcmUfPart: number;
  vlIcmUfDest: number;
  vlIcmUfRem: number;
  vlPorIcmFcpUfDest: number;
  vlIcmFcpUfDest: number;

  // IPI
  nrSittribIpi: string;
  fkEnquadramentoIpi: string;
  vlIpiBc: number;
  vlPorIpi: number;
  vlIpi: number;
  vlIpiPorUnidade: number;

  // PIS
  nrSittribPis: string;
  vlPisBc: number;
  vlPorPis: number;
  vlPis: number;

  // COFINS
  nrSittribCofins: string;
  vlCofinsBc: number;
  vlPorCofins: number;
  vlCofins: number;

  // Reforma Tributária: Imposto Seletivo (IS)
  vlIsBc: number;
  vlPorIs: number;
  vlIs: number;

  // Reforma Tributária: IBS / CBS
  vlIbsCbsBc: number;
  vlPorIbsUf: number;
  vlIbsUf: number;
  vlPorIbsMun: number;
  vlIbsMun: number;
  vlPorCbs: number;
  vlCbs: number;

  // Benefício Fiscal
  cdBenefis: string;

  // Memória e rastreamento
  memory: TaxCalculationMemory;
}

export interface SimulationPayload {
  item: ItemFiscalInput;
  cabecalho: CabecalhoFiscalInput;
  cursors: {
    tmpCalCfo?: any;
    tmpInfComplCfo?: any;
    tmpCalPro?: any;
    tmpOrigemFci?: any;
    tmpCalEmp?: any;
    tmpCalCad?: any;
    tmpCalIcm?: any;
    tmpIcmUfDest?: any;
    tmpCalCf?: any;
    tmpCalCfEx?: any;
    tmpCalCfFcpIcms?: any;
    tmpCalCfDiferimentoIcms?: any;
    tmpCalCfExCad?: any;
    tmpCalIcmSt?: any;
    tmpProdutoPautaSt?: any;
    tmpIcmStRet?: any;
    tmpDest?: any;
    tmpRegraImpIcm?: any[];
    tmpRegraImpIpi?: any[];
    tmpRegraImpPis?: any[];
    tmpRegraImpCofins?: any[];
    tmpRegraImpIs?: any[];
    tmpRegraImpIbsCbs?: any[];
    tmpSitTributariaIcms?: any[];
    tmpSitTribIpi?: any[];
    tmpSitTribPis?: any[];
    tmpSitTribCofins?: any[];
    // Exceções de PIS/COFINS são cursores próprios no NFE_CALCULARITEM.PRG.
    // Não usar a exceção de ICMS como aproximação para esses impostos.
    tmpCalCfExPis?: any[];
    tmpCalCfExCofins?: any[];
    tsParametros?: Record<string, any>;
  };
}
