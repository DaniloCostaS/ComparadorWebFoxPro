/**
 * Motor de Cálculo Fiscal NF-e
 * Tradução fidedigna de NFE_CALCULARITEM.PRG e NFE_CALCULARITEM_DIFALESPECIAL.PRG
 * com geração completa de Memória de Cálculo e Rastreamento da Pirâmide de Hierarquia
 */

import type {
  CalculatedItemResult,
  TaxCalculationMemory,
  HierarchyStep,
  FormulaTrace,
  SimulationPayload
} from './types';

export function round(value: number, decimals: number = 2): number {
  if (!value || isNaN(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function tiraIpi(precoBase: number, aliqIpi: number): number {
  if (!precoBase || !aliqIpi) return 0;
  // Conforme SYS_FUNCOES.PRG linha 393:
  // lnRETORNA = (( ARREDONDA( tnVALOR / (1 + (tnVLPERCIPI / 100) ),'PU' ) * tnVLPERCIPI ) / 100 )
  const valorSemIpi = round(precoBase / (1 + (aliqIpi / 100)), 2);
  return round((valorSemIpi * aliqIpi) / 100, 2);
}

/**
 * O FoxPro faz SEEK na tabela de situação tributária e usa o campo TG_* dela.
 * Não existe regra legislativa alternativa no PRG: se o cadastro não existir,
 * o simulador deve interromper a execução em vez de escolher uma CST "segura".
 */
export class FiscalSourceDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FiscalSourceDataError';
  }
}

export class TaxEngine {
  /**
   * Executa a simulação completa do cálculo do item de NF-e
   */
  public static calculate(payload: SimulationPayload): CalculatedItemResult {
    const { item, cabecalho, cursors } = payload;

    // Estruturas para trilha de memória de cálculo
    const hierarchySteps: HierarchyStep[] = [];
    const formulas: FormulaTrace[] = [];
    const complementaryInfo: Array<{ id?: number; text: string; source: string }> = [];
    const systemParameters: Record<string, any> = {};

    // Helper para leitura de configurações (RETORNASET)
    const retornaSet = (param: string, tipo: 'C' | 'N' | 'L' = 'N', defaultVal: any = 0): any => {
      const val = cursors.tsParametros?.[param] ?? cursors.tsParametros?.[param.toUpperCase()];
      if (val !== undefined && val !== null && val !== '') {
        systemParameters[param] = val;
        if (tipo === 'N') return Number(val);
        if (tipo === 'L') return val === true || val === 1 || String(val).toUpperCase() === 'S';
        return String(val);
      }
      systemParameters[param] = `${defaultVal} (padrão)`;
      return defaultVal;
    };

    // Helper para registrar etapa da pirâmide
    const logHierarchy = (step: HierarchyStep) => {
      hierarchySteps.push(step);
    };

    // Helper para registrar fórmula da memória
    const logFormula = (tax: string, description: string, formula: string, evaluated: string, result: number) => {
      formulas.push({ tax, description, formula, evaluated, result });
    };

    // Helper para adicionar Informação Complementar
    const addInfCompl = (id: number | undefined, text: string, source: string) => {
      if (!id && !text) return;
      if (!complementaryInfo.some(c => (id && c.id === id) || (text && c.text === text))) {
        complementaryInfo.push({ id, text, source });
      }
    };

    // Cursors normalizados
    const cfo = cursors.tmpCalCfo || {};
    const pro = cursors.tmpCalPro || {};
    const emp = cursors.tmpCalEmp || {};
    const cad = cursors.tmpCalCad || {};
    const icm = cursors.tmpCalIcm || {};
    const cf = cursors.tmpCalCf || {};
    const cfEx = cursors.tmpCalCfEx || {};
    const cfExCad = cursors.tmpCalCfExCad || {};
    const icmSt = cursors.tmpCalIcmSt || {};
    const fcpIcm = cursors.tmpCalCfFcpIcms || {};
    const difIcm = cursors.tmpCalCfDiferimentoIcms || {};
    const dest = cursors.tmpDest || {};
    // O PRG só aplica exceção federal se o cursor tiver exatamente um registro
    // (RECCOUNT('TMPCALCFEXPIS/COFINS') = 1). Não escolher a primeira quando
    // há duplicidade é parte do comportamento que o suporte precisa enxergar.
    const cfExPisRows = Array.isArray(cursors.tmpCalCfExPis) ? cursors.tmpCalCfExPis : [];
    const cfExCofinsRows = Array.isArray(cursors.tmpCalCfExCofins) ? cursors.tmpCalCfExCofins : [];
    const cfExPis = cfExPisRows.length === 1 ? cfExPisRows[0] : {};
    const cfExCofins = cfExCofinsRows.length === 1 ? cfExCofinsRows[0] : {};
    const regrasIcm = cursors.tmpRegraImpIcm || [];
    const regrasIpi = cursors.tmpRegraImpIpi || [];
    const regrasPis = cursors.tmpRegraImpPis || [];
    const regrasCofins = cursors.tmpRegraImpCofins || [];

    // --- 1. VALIDAÇÃO INICIAL (L16-L52) ---
    const tipo = String(cabecalho.tipo ?? '').trim().toUpperCase() as 'S' | 'E';
    if (tipo !== 'S' && tipo !== 'E') {
      throw new FiscalSourceDataError('O tipo do movimento (S/E) não foi informado. O NFE_CALCULARITEM.PRG não troca esse contexto por uma saída padrão.');
    }
    const regime = Number(cabecalho.tgRegime ?? emp.TG_REGIMETRIBUTARIO ?? emp.TG_REGIME);
    if (!Number.isFinite(regime)) {
      throw new FiscalSourceDataError('O regime tributário do cabeçalho/empresa não foi informado. A simulação não assumiu regime normal.');
    }
    const qtMovimento = Number(item.qtMovimento);
    const vlUnitario = Number(item.vlUnitario);
    if (!Number.isFinite(qtMovimento) || !Number.isFinite(vlUnitario)) {
      throw new FiscalSourceDataError('Quantidade e valor unitário devem ser informados pelo item original.');
    }
    const vlPretot = item.vlTotal !== undefined && item.vlTotal !== null
      ? round(Number(item.vlTotal), 2)
      : round(qtMovimento * vlUnitario, 2);

    const vlFreteUni = Number(item.vlFrete || 0);
    const vlSeguroUni = Number(item.vlSeguro || 0);
    const vlDespesasUni = Number(item.vlDespesas || 0);
    const vlDesconto = Number(item.vlDesconto || 0);
    const tgTransferencia = Number(item.tgTransferencia ?? cfo.TG_TRANSFERENCIA ?? 0);

    logFormula(
      'GERAL',
      'Valor Total dos Produtos',
      'Quantidade × Valor Unitário',
      `${qtMovimento} × R$ ${vlUnitario.toFixed(2)}`,
      vlPretot
    );

    const notEmpty = (val: any): boolean => val !== null && val !== undefined && String(val).trim() !== '';
    const cleanStr = (val: any): string => String(val ?? '').trim();

    // Origem do produto (0=Nacional, 1=Estrangeira Direta, 2=Estrangeira Adq. Mercado Interno, etc.)
    const tgOrigemIcms = cleanStr(pro.TG_ORIGEMICMS);

    const findTaxSituation = (records: any[] | undefined, code: string, table: string, field: string): any => {
      const normalizedCode = String(code ?? '').trim();
      if (!normalizedCode) {
        throw new FiscalSourceDataError(`O ${table} não recebeu uma CST para consultar ${field}. O NFE_CALCULARITEM.PRG não substitui esse valor por uma CST padrão.`);
      }
      const record = (records || []).find((row: any) => String(row.PK_ID ?? '').trim() === normalizedCode);
      if (!record) {
        throw new FiscalSourceDataError(`A CST "${normalizedCode}" não foi localizada em ${table}. A simulação foi interrompida para não inventar o valor de ${field}.`);
      }
      return record;
    };

    // =========================================================================
    // --- 2. CÁLCULO DO IPI (L3368-L3490 e L230-L340) ---
    // =========================================================================
    let nrSittribIpi = cleanStr(cfo.NR_SITTRIBIPI);
    let fkEnquadramentoIpi = cleanStr(cfo.FK_ENQUADRAMENTOIPI);
    let vlPorIpi = Number(cf.VL_PORIPI || 0); // Padrão do FoxPro é usar TMPCALCF.VL_PORIPI
    let vlIpiPorUnidade = 0;
    let tgCalcIpiQtd = 0;
    let ipiTributando = Number(cfo.TG_IPI ?? 0) === 1;
    let fkIpiInfCompl = 0;
    let ipiWinner = 'CFOP Padrão';

    logHierarchy({
      tax: 'IPI',
      levelName: '1. CFOP Base',
      tableSource: 'TB_CFOP',
      recordFound: !!cfo.PK_ID,
      applied: true,
      cstBefore: '',
      cstAfter: nrSittribIpi,
      rate: vlPorIpi,
      reason: `Definição da CST inicial de IPI: ${nrSittribIpi || '(em branco)'}`
    });

    if (ipiTributando) {
      // Exceção NCM (TB_CLAFIS)
      if (tipo === 'S' && notEmpty(cf.NR_SITTRIBIPISAI)) {
        nrSittribIpi = cleanStr(cf.NR_SITTRIBIPISAI);
        fkEnquadramentoIpi = cleanStr(cf.FK_ENQUADRAMENTOIPI);
        ipiTributando = Number(cf.TG_IPI ?? 0) === 1;
        ipiWinner = 'NCM (TB_CLAFIS)';
        logHierarchy({
          tax: 'IPI',
          levelName: '2. NCM / Classificação Fiscal',
          tableSource: 'TB_CLAFIS',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIpi,
          rate: vlPorIpi,
          reason: `NCM configurou CST ${nrSittribIpi}`
        });
      } else if (tipo === 'E' && notEmpty(cf.NR_SITTRIBIPIENT)) {
        nrSittribIpi = cleanStr(cf.NR_SITTRIBIPIENT);
        fkEnquadramentoIpi = cleanStr(cf.FK_ENQUADRAMENTOIPIENT);
        ipiTributando = Number(cf.TG_IPIENT ?? 0) === 1;
        ipiWinner = 'NCM (TB_CLAFIS)';
        logHierarchy({
          tax: 'IPI',
          levelName: '2. NCM / Classificação Fiscal',
          tableSource: 'TB_CLAFIS',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIpi,
          rate: vlPorIpi,
          reason: `NCM configurou CST ${nrSittribIpi}`
        });
      }

      // Exceção Produto (TB_PRODUTOS)
      if (ipiTributando && notEmpty(pro.NR_SITTRIBIPI)) {
        nrSittribIpi = cleanStr(pro.NR_SITTRIBIPI);
        fkEnquadramentoIpi = cleanStr(pro.FK_ENQUADRAMENTOIPI);
        ipiTributando = Number(pro.TG_IPI ?? 0) === 1;
        ipiWinner = 'Cadastro do Produto (TB_PRODUTOS)';
        logHierarchy({
          tax: 'IPI',
          levelName: '3. Produto',
          tableSource: 'TB_PRODUTOS',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIpi,
          rate: vlPorIpi,
          reason: `Produto configurou CST ${nrSittribIpi}`
        });
      }

      // Isenção Cliente (TB_CADUNICO)
      if (ipiTributando && Number(cad.TG_IPI ?? 0) === 1) {
        nrSittribIpi = cleanStr(cad.NR_SITTRIBIPI);
        fkEnquadramentoIpi = cleanStr(cad.FK_ENQUADRAMENTOIPI);
        ipiTributando = Number(cad.TG_IPITRIB ?? 0) === 1;
        fkIpiInfCompl = Number(cad.FK_INFCOMPLIPI ?? 0);
        ipiWinner = 'Isenção Cliente (TB_CADUNICO)';
        logHierarchy({
          tax: 'IPI',
          levelName: '4. Isenção Cliente',
          tableSource: 'TB_CADUNICO',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIpi,
          rate: vlPorIpi,
          reason: 'Cliente alterou tributação de IPI'
        });
      }

      // Isenção Empresa (TB_EMPRESAS)
      if (ipiTributando && Number(emp.TG_ISENTOIPI ?? 0) === 1) {
        nrSittribIpi = cleanStr(emp.NR_SITTRIBIPI);
        fkEnquadramentoIpi = cleanStr(emp.FK_ENQUADRAMENTOIPI);
        ipiTributando = Number(emp.TG_IPI ?? 0) === 1;
        fkIpiInfCompl = Number(emp.FK_INFCOMPLIPI ?? 0);
        ipiWinner = 'Isenção Empresa Emitente (TB_EMPRESAS)';
        logHierarchy({
          tax: 'IPI',
          levelName: '5. Isenção Empresa',
          tableSource: 'TB_EMPRESAS',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIpi,
          rate: vlPorIpi,
          reason: 'Empresa emitente alterou tributação de IPI'
        });
      }
    }

    if (fkIpiInfCompl > 0) {
      addInfCompl(fkIpiInfCompl, 'Informação Complementar IPI', 'Exceção IPI');
    }

    // Consulta TB_SITTRIBIPI (TMPCALSTIPI)
    const sitIpi = findTaxSituation(cursors.tmpSitTribIpi, nrSittribIpi, 'TB_SITTRIBIPI', 'TG_IPI');
    if (Number(sitIpi.FK_INFCOMPLIPI ?? 0) > 0) {
      addInfCompl(sitIpi.FK_INFCOMPLIPI, 'Informação Complementar CST IPI', 'TB_SITTRIBIPI');
    }

    // Alíquota de IPI da classificação fiscal (TMPCALCF.VL_PORIPI)
    vlPorIpi = Number(cf.VL_PORIPI || 0);

    // IPI por quantidade
    if (Number(pro.VL_IPIPORQTD ?? 0) > 0) {
      vlIpiPorUnidade = Number(pro.VL_IPIPORQTD);
      tgCalcIpiQtd = 1;
      vlPorIpi = 0;
    }

    // Incentivo fiscal de IPI
    if (Number(cabecalho.tgIncentivoIpi ?? 0) === 1 && Number(cad.FK_INFCOMPLIPIINCT ?? 0) > 0) {
      addInfCompl(cad.FK_INFCOMPLIPIINCT, 'Incentivo Fiscal IPI', 'TB_CADUNICO');
    }

    // Isenção de IPI - CST não tributa (TG_IPI = 0)
    if (Number(sitIpi.TG_IPI ?? 0) === 0) {
      vlPorIpi = 0;
      tgCalcIpiQtd = 0;
      vlIpiPorUnidade = 0;
    }

    // Regra de Imposto de IPI (TB_REGRAIMPOSTO)
    const regraIpi = regrasIpi.find(r => cleanStr(r.TG_IMPOSTO).toUpperCase() === 'IPI');
    if (regraIpi) {
      if (regraIpi.VL_PORIMPOSTO !== undefined && regraIpi.VL_PORIMPOSTO !== null) {
        vlPorIpi = Number(regraIpi.VL_PORIMPOSTO);
      }
      if (notEmpty(regraIpi.CD_SITRIBUTARIA)) {
        nrSittribIpi = cleanStr(regraIpi.CD_SITRIBUTARIA);
      }
      if (notEmpty(regraIpi.FK_ENQUADRAMENTOIPI)) {
        fkEnquadramentoIpi = cleanStr(regraIpi.FK_ENQUADRAMENTOIPI);
      }
      if (Number(regraIpi.FK_INFCOMPL ?? 0) > 0) {
        addInfCompl(regraIpi.FK_INFCOMPL, 'Regra Imposto IPI', 'TB_REGRAIMPOSTO');
      }
      ipiWinner = 'Regra de Imposto (TB_REGRAIMPOSTO)';
      logHierarchy({
        tax: 'IPI',
        levelName: '6. Regra de Imposto Dinâmica',
        tableSource: 'TB_REGRAIMPOSTO',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIpi,
        rate: vlPorIpi,
        reason: `Regra de imposto específica sobrepôs IPI para CST ${nrSittribIpi}`
      });
    }

    // Cálculo numérico do IPI (L280-L335 do NFE_CALCULARITEM.PRG)
    let vlIpiBc = vlPretot;
    let vlIpi = 0;

    if (tgTransferencia === 1) {
      let lnTransferenciaIpi = retornaSet('FATURAMENTO.TRANSFMARGEMIPI', 'N', 100);
      if (lnTransferenciaIpi <= 0) lnTransferenciaIpi = 100;
      const ipiRetirado = tiraIpi(vlPretot, vlPorIpi);
      vlIpiBc = round((vlPretot - ipiRetirado) * (lnTransferenciaIpi / 100), 2);
      logFormula(
        'IPI',
        'Base IPI na Transferência',
        '(Valor - TIRAIPI) × (Margem Transf / 100)',
        `(${vlPretot} - ${ipiRetirado}) × (${lnTransferenciaIpi} / 100)`,
        vlIpiBc
      );
    } else {
      vlIpiBc = round(vlPretot, 2);
      if (retornaSet('VENDAS.IPICOMFRETE', 'N', 1) === 1) {
        vlIpiBc += vlFreteUni;
      }
      if (retornaSet('FATURAMENTO.IPICOMSEGDESPESA', 'N', 1) === 1) {
        vlIpiBc += vlDespesasUni + vlSeguroUni;
      }
      if (retornaSet('FATURAMENTO.IPICOMDESCONTOINCO', 'N', 1) === 1) {
        vlIpiBc -= vlDesconto;
      }
      vlIpiBc = round(Math.max(0, vlIpiBc), 2);
    }

    if (tgCalcIpiQtd === 1) {
      vlPorIpi = 0;
      vlIpi = round(qtMovimento * vlIpiPorUnidade, 2);
      logFormula('IPI', 'Valor do IPI por Quantidade', 'Quantidade × Valor por Quantidade', `${qtMovimento} × ${vlIpiPorUnidade}`, vlIpi);
    } else {
      vlIpi = round((vlIpiBc * vlPorIpi) / 100, 2);
      if (vlPorIpi > 0) {
        logFormula('IPI', 'Valor do IPI', 'Base IPI × (Alíquota / 100)', `${vlIpiBc} × (${vlPorIpi} / 100)`, vlIpi);
      }
    }
    if (vlPorIpi === 0 && tgCalcIpiQtd === 0) {
      vlIpiBc = 0;
      vlIpi = 0;
    }

    // =========================================================================
    // --- 3. CÁLCULO DO ICMS (L2910-L3367 e L399-L736) ---
    // =========================================================================
    let nrSittribIcms = '';
    let vlPorIcm = 0;
    let vlPorIcmRbbc = 0;
    let vlPorIcmDeson = 0;
    let vlIcmDeson = 0;
    let fkMotivoDesonIcms = 0;
    let cdBenefis = '';
    let nrCest = '';
    let vlPorIcmFcp = 0;
    let vlPorIcmDed = 0; // Diferimento %
    let vlPorIcmRbbcDed = 0;
    let icmsWinner = 'CFOP';

    // 3.1 Nível 1: CFOP
    const cstCfop = regime === 2
      ? String(cfo.NR_SITTRIBICMSSN || '').trim()
      : String(cfo.NR_SITTRIBICMS || '').trim();

    nrSittribIcms = tgOrigemIcms + cstCfop;
    cdBenefis = String(cfo.CD_BENEFIS || '').trim();

    logHierarchy({
      tax: 'ICMS',
      levelName: '1. CFOP Base',
      tableSource: 'TB_CFOP',
      recordFound: !!cfo.PK_ID,
      applied: true,
      cstBefore: '',
      cstAfter: nrSittribIcms,
      reason: `CST Inicial definida pelo CFOP ${cfo.PK_ID || item.fkCfop} (${regime === 2 ? 'Simples Nacional' : 'Regime Normal'})`
    });

    // Helper: verifica se a situação tributária atual calcula ICMS
    // No FoxPro:
    // SELE TMPSITTRIBUTARIAICMS
    // SEEK toREGITE.NR_SITTRIB
    // IF TMPSITTRIBUTARIAICMS.TG_ICMS = 1
    const tributaIcms = (cstCompleto: string): boolean => {
      const sit = findTaxSituation(cursors.tmpSitTributariaIcms, cstCompleto, 'TB_SITTRIBUTARIA', 'TG_ICMS');
      return Number(sit.TG_ICMS) === 1;
    };

    // 3.2 Nível 2: Exceção NCM por UF (TB_CLAFISEXC)
    if (tributaIcms(nrSittribIcms) && cfEx.PK_ID && cfEx.CD_SITTRIBUTARIA) {
      nrSittribIcms = tgOrigemIcms + String(cfEx.CD_SITTRIBUTARIA).trim();
      vlPorIcmRbbc = Number(cfEx.VL_PORREDUICMS || 0);
      if (cfEx.NR_CEST) nrCest = String(cfEx.NR_CEST).trim();
      if (cfEx.CD_BENEFIS) cdBenefis = String(cfEx.CD_BENEFIS).trim();
      addInfCompl(cfEx.FK_INFCOMPL, 'Exceção Fiscal NCM/UF', 'TB_CLAFISEXC');
      icmsWinner = `Exceção NCM/UF (TB_CLAFISEXC) - NCM ${cf.CD_CLAFIS || ''}`;

      logHierarchy({
        tax: 'ICMS',
        levelName: '2. Exceção NCM / UF',
        tableSource: 'TB_CLAFISEXC',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIcms,
        reduction: vlPorIcmRbbc,
        reason: `Exceção de NCM para UF ${cabecalho.dsUf} encontrada. CST alterado para ${nrSittribIcms}, Redução ${vlPorIcmRbbc}%`
      });
    } else if (cfEx.PK_ID) {
      logHierarchy({
        tax: 'ICMS',
        levelName: '2. Exceção NCM / UF',
        tableSource: 'TB_CLAFISEXC',
        recordFound: true,
        applied: false,
        reason: !tributaIcms(nrSittribIcms)
          ? `Nível ignorado: CST atual (${nrSittribIcms}) é não-tributada / isenta (TG_ICMS = 0). Regra FoxPro: 'primeira isenção encontrada deve permanecer'.`
          : 'Exceção encontrada, mas a CST anterior não autoriza troca ou não tributa'
      });
    }

    // 3.3 Nível 3: Exceção por Cliente (TB_EXCECAOICMS)
    if (tributaIcms(nrSittribIcms) && cfExCad.PK_ID && cfExCad.CD_SITTRIBUTARIA) {
      nrSittribIcms = tgOrigemIcms + String(cfExCad.CD_SITTRIBUTARIA).trim();
      if (regime === 1) {
        vlPorIcmRbbc = Number(cfExCad.VL_PORREDUICMS || 0);
      }
      fkMotivoDesonIcms = Number(cfExCad.FK_MOTIVODESONICMS || 0);
      if (cfExCad.CD_BENEFIS) cdBenefis = String(cfExCad.CD_BENEFIS).trim();
      addInfCompl(cfExCad.FK_INFCOMPL, 'Exceção Fiscal Cliente', 'TB_EXCECAOICMS');
      icmsWinner = `Exceção Cliente (TB_EXCECAOICMS) - Cliente ${cabecalho.fkCadunico}`;

      logHierarchy({
        tax: 'ICMS',
        levelName: '3. Exceção por Cliente',
        tableSource: 'TB_EXCECAOICMS',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIcms,
        reduction: vlPorIcmRbbc,
        reason: `Regra de exceção vinculada ao Cliente ${cabecalho.fkCadunico} aplicada`
      });
    } else if (cfExCad.PK_ID && !tributaIcms(nrSittribIcms)) {
      logHierarchy({
        tax: 'ICMS',
        levelName: '3. Exceção por Cliente',
        tableSource: 'TB_EXCECAOICMS',
        recordFound: true,
        applied: false,
        reason: `Nível ignorado: CST atual (${nrSittribIcms}) é não-tributada / isenta (TG_ICMS = 0). Regra FoxPro: 'primeira isenção encontrada deve permanecer'.`
      });
    }

    // 3.4 Nível 4: Produto (TB_PRODUTOS)
    if (tributaIcms(nrSittribIcms)) {
      if (notEmpty(pro.NR_SITTRIB)) {
        const cstProd = cleanStr(pro.NR_SITTRIB);
        nrSittribIcms = tgOrigemIcms + cstProd;
        icmsWinner = 'Cadastro do Produto (TB_PRODUTOS)';
        logHierarchy({
          tax: 'ICMS',
          levelName: '4. Produto',
          tableSource: 'TB_PRODUTOS',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIcms,
          reason: `CST do produto utilizada: ${nrSittribIcms}`
        });
      }
    } else {
      logHierarchy({
        tax: 'ICMS',
        levelName: '4. Produto',
        tableSource: 'TB_PRODUTOS',
        recordFound: !!(pro.PK_ID || pro.CD_SITTRIBUTARIA),
        applied: false,
        cstBefore: nrSittribIcms,
        cstAfter: nrSittribIcms,
        reason: `Nível ignorado: CST atual (${nrSittribIcms}) é não-tributada / isenta (TG_ICMS = 0). Regra FoxPro: 'primeira isenção encontrada deve permanecer'.`
      });
    }

    // 3.5 Nível 5: Cliente e Empresa Emitente (TB_CADUNICO / TB_EMPRESAS)
    if (tributaIcms(nrSittribIcms) && Number(cad.TG_ICMS ?? 0) === 1) {
      if (notEmpty(cad.NR_SITTRIBICMS)) {
        nrSittribIcms = tgOrigemIcms + cleanStr(cad.NR_SITTRIBICMS);
        fkMotivoDesonIcms = Number(cad.FK_MOTIVODESONICMS ?? 0);
        vlPorIcm = 0;
        if (cad.CD_BENEFIS) cdBenefis = cleanStr(cad.CD_BENEFIS);
        if (Number(cad.FK_INFCOMPLICMS ?? 0) > 0) addInfCompl(cad.FK_INFCOMPLICMS, 'Isenção ICMS do Cliente', 'TB_CADUNICO');
        icmsWinner = 'Isenção Cliente (TB_CADUNICO)';
        logHierarchy({
          tax: 'ICMS',
          levelName: '5. Cliente',
          tableSource: 'TB_CADUNICO',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIcms,
          reason: 'Cliente substituiu a CST conforme TG_ICMS / NR_SITTRIBICMS.'
        });
      }
    }

    if (tributaIcms(nrSittribIcms) && Number(emp.TG_ISENTOICMS ?? 0) === 1) {
      if (notEmpty(emp.NR_SITTRIBICMS)) {
        nrSittribIcms = tgOrigemIcms + cleanStr(emp.NR_SITTRIBICMS);
        vlPorIcm = 0;
        if (Number(emp.FK_INFCOMPLICMS ?? 0) > 0) addInfCompl(emp.FK_INFCOMPLICMS, 'Isenção ICMS da Empresa', 'TB_EMPRESAS');
        icmsWinner = 'Empresa Emitente Isenta (TB_EMPRESAS)';
        logHierarchy({
          tax: 'ICMS',
          levelName: '6. Empresa Emitente',
          tableSource: 'TB_EMPRESAS',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIcms,
          reason: 'Empresa emitente cadastrada com isenção de ICMS'
        });
      }
    } else if (!tributaIcms(nrSittribIcms) && emp.TG_ISENTOICMS === 1) {
      logHierarchy({
        tax: 'ICMS',
        levelName: '6. Empresa Emitente',
        tableSource: 'TB_EMPRESAS',
        recordFound: true,
        applied: false,
        reason: `Nível ignorado: CST atual (${nrSittribIcms}) é não-tributada / isenta (TG_ICMS = 0). Regra FoxPro: 'primeira isenção encontrada deve permanecer'.`
      });
    }

    // 3.6 Nível 6: Regra de Impostos (TB_REGRAIMPOSTO)
    const regraIcms = regrasIcm.find(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'ICMS');
    if (tributaIcms(nrSittribIcms) && regraIcms && regraIcms.CD_SITRIBUTARIA) {
      nrSittribIcms = tgOrigemIcms + String(regraIcms.CD_SITRIBUTARIA).trim();
      if (regime === 1) {
        vlPorIcmRbbc = Number(regraIcms.VL_PORREDUCAO || 0);
        vlPorIcmFcp = Number(regraIcms.VL_PORICMFCP || 0);
        fkMotivoDesonIcms = Number(regraIcms.FK_MOTIVODESONICMS || 0);
        if (regraIcms.CD_BENEFIS) cdBenefis = String(regraIcms.CD_BENEFIS).trim();
      }
      if (regraIcms.NR_CEST) nrCest = String(regraIcms.NR_CEST).trim();
      addInfCompl(regraIcms.FK_INFCOMPL, 'Regra de Imposto ICMS', 'TB_REGRAIMPOSTO');
      icmsWinner = 'Regra de Imposto (TB_REGRAIMPOSTO)';

      logHierarchy({
        tax: 'ICMS',
      levelName: '7. Regra de Imposto Dinâmica',
        tableSource: 'TB_REGRAIMPOSTO',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIcms,
        reduction: vlPorIcmRbbc,
        reason: `Regra de imposto dinâmica sobrepôs parâmetros de ICMS (CST ${nrSittribIcms})`
      });
    } else if (!tributaIcms(nrSittribIcms) && regraIcms && regraIcms.CD_SITRIBUTARIA) {
      logHierarchy({
        tax: 'ICMS',
      levelName: '7. Regra de Imposto Dinâmica',
        tableSource: 'TB_REGRAIMPOSTO',
        recordFound: true,
        applied: false,
        reason: `Nível ignorado: CST atual (${nrSittribIcms}) é não-tributada / isenta (TG_ICMS = 0). Regra FoxPro: 'primeira isenção encontrada deve permanecer'.`
      });
    }

    // 3.7 Apuração da Alíquota de ICMS (RETORNARICMS L1154-L1242)
    vlPorIcm = 0;
    if (tipo === 'S') {
      if (cad.TG_PESSOA === 'F') {
        vlPorIcm = Number(icm.VL_PORICMCONS ?? 0);
      } else {
        vlPorIcm = cad.TG_CONTRIBUINTEICMS === 1
          ? Number(icm.VL_PORICM ?? 0)
          : Number(icm.VL_PORICMCONS ?? 0);
      }
    } else {
      vlPorIcm = emp.TG_CONTRIBUINTEICMS === 1
        ? Number(icm.VL_PORICM ?? 0)
        : Number(icm.VL_PORICMCONS ?? 0);
    }

    // Sobrescrita da alíquota pelas exceções
    if (cfEx.CD_SITTRIBUTARIA) {
      vlPorIcm = Number(cfEx.VL_PORICMS);
    }
    if (cfExCad.CD_SITTRIBUTARIA && regime === 1) {
      vlPorIcm = Number(cfExCad.VL_PORICMS);
    }
    if (regraIcms?.CD_SITRIBUTARIA && regime === 1) {
      vlPorIcm = Number(regraIcms.VL_PORIMPOSTO);
    }

    logHierarchy({
      tax: 'ICMS',
      levelName: '7. Apuração da Alíquota (RETORNARICMS)',
      tableSource: 'TB_ICMS / Exceções',
      recordFound: true,
      applied: true,
      rate: vlPorIcm,
      reason: `Alíquota apurada para ${tipo === 'S' ? 'Saída' : 'Entrada'}, Destino ${cabecalho.dsUf}, Contribuinte=${cad.TG_CONTRIBUINTEICMS === 1 ? 'Sim' : 'Não'}`
    });

    // 3.8 Diferimento de ICMS (L3086-L3101)
    if (difIcm.PK_ID && difIcm.CD_SITTRIBUTARIA && difIcm.VL_PORDIFERIMENTOICMS > 0 && cfo.TG_NAOCALCICMSDIF === 0) {
      nrSittribIcms = tgOrigemIcms + String(difIcm.CD_SITTRIBUTARIA).trim();
      vlPorIcmDed = Number(difIcm.VL_PORDIFERIMENTOICMS || 0);
      if (difIcm.CD_BENEFIS) cdBenefis = String(difIcm.CD_BENEFIS).trim();
      addInfCompl(difIcm.FK_INFCOMPL, 'Diferimento de ICMS', 'TB_CLAFISDIFERIMENTOICMS');
      logHierarchy({
        tax: 'ICMS',
        levelName: '8. Diferimento de ICMS',
        tableSource: 'TB_CLAFISDIFERIMENTOICMS',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIcms,
        rate: vlPorIcmDed,
        reason: `Diferimento de ICMS aplicado com percentual de ${vlPorIcmDed}%`
      });
    }

    // 3.9 Substituição Tributária (ST) (L3103-L3184)
    let vlPorIcmVaBcSt = 0;
    let vlPorIcmSt = 0;
    let vlPorIcmRbbcSt = 0;
    let vlPorIcmFcpSt = 0;
    let vlBaseArbitrada = 0;
    let stDeducaoIcms = false;
    let tgSemIcmsOperacao = 0;
    let stWinner: string | undefined = undefined;

    if (cfo.TG_NAOCALCSUBSICMS === 0) {
      // Regra ST padrão (TB_SUBSTRIBUTARIA)
      if (icmSt.PK_ID && dest.TG_CALCICMSST === 1) {
        if (icmSt.CD_SITTRIBUTARIA) {
          nrSittribIcms = tgOrigemIcms + String(icmSt.CD_SITTRIBUTARIA).trim();
        }
        vlBaseArbitrada = Number(icmSt.VL_BASEARBITRADA || 0);
        vlPorIcmVaBcSt = Number(icmSt.VL_ALIQBASE || 0); // MVA
        vlPorIcmSt = Number(icmSt.VL_PORCSUBS || 0);
        vlPorIcmRbbcSt = Number(icmSt.VL_PORREDUICMS || 0);
        vlPorIcmFcpSt = Number(icmSt.VL_PORICMFCP || 0);
        stDeducaoIcms = icmSt.TG_DEDUZIR === 1;
        tgSemIcmsOperacao = Number(icmSt.TG_SEMICMSOPERACAO ?? 0);
        if (icmSt.NR_CEST) nrCest = String(icmSt.NR_CEST).trim();
        addInfCompl(icmSt.FK_INFCOMPL, 'Substituição Tributária', 'TB_SUBSTRIBUTARIA');
        stWinner = 'Substituição Tributária (TB_SUBSTRIBUTARIA)';

        logHierarchy({
          tax: 'ICMS-ST',
          levelName: '9. Substituição Tributária',
          tableSource: 'TB_SUBSTRIBUTARIA',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIcms,
          rate: vlPorIcmSt,
          reason: `ST aplicada: MVA ${vlPorIcmVaBcSt}%, Alíquota ST ${vlPorIcmSt}%, Redução ST ${vlPorIcmRbbcSt}%`
        });
      }

      // Regra ST por Regra de Imposto (TB_REGRAIMPOSTO)
      const regraSt = regrasIcm.find(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'ICMSST');
      if (regraSt) {
        nrSittribIcms = regime === 2
          ? String(regraSt.CD_SITRIBUTARIA).trim()
          : tgOrigemIcms + String(regraSt.CD_SITRIBUTARIA).trim();
        vlPorIcmVaBcSt = Number(regraSt.VL_ALIQBASE || 0);
        vlPorIcmSt = Number(regraSt.VL_PORIMPOSTO || 0);
        vlPorIcmRbbcSt = Number(regraSt.VL_PORREDUCAO || 0);
        vlPorIcmFcpSt = Number(regraSt.VL_PORICMFCP || 0);
        stDeducaoIcms = regraSt.TG_DEDUZIR === 1;
        if (regraSt.NR_CEST) nrCest = String(regraSt.NR_CEST).trim();
        stWinner = 'Regra de Imposto ST (TB_REGRAIMPOSTO)';

        logHierarchy({
          tax: 'ICMS-ST',
          levelName: '9. Regra de Imposto ST',
          tableSource: 'TB_REGRAIMPOSTO',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIcms,
          rate: vlPorIcmSt,
          reason: `ST sobreposta por regra de imposto: MVA ${vlPorIcmVaBcSt}%, Alíquota ${vlPorIcmSt}%`
        });
      }
    }

    // TG_DEDUZIR transfere o ICMS próprio para a dedução da ST. O PRG zera
    // a alíquota própria e preserva a alíquota/base em campos de dedução.
    if (stDeducaoIcms) {
      vlPorIcmDed = vlPorIcm;
      vlPorIcm = 0;
      vlPorIcmRbbcDed = vlPorIcmRbbc;
      vlPorIcmRbbc = 0;
    }

    // CARREGARICMS só zera a alíquota de CST não tributada para saída.
    if (tipo === 'S' && !tributaIcms(nrSittribIcms)) {
      vlPorIcm = 0;
    }

    // Controle de ST sem ICMS da operação (linhas 3216-3225 do PRG).
    if (vlPorIcmSt > 0
      && ((!stDeducaoIcms && vlPorIcm === 0) || (stDeducaoIcms && vlPorIcmDed === 0))
      && Number(icmSt.TG_CALCSUBSEMICM ?? 0) !== 1) {
      vlPorIcmSt = 0;
      vlPorIcmVaBcSt = 0;
      vlBaseArbitrada = 0;
      vlPorIcmFcpSt = 0;
    }

    // 3.10 FCP Normal
    if (fcpIcm.VL_PORICMFCPUFDEST > 0 && cfo.TG_NAOCALCICMSFCP === 0) {
      vlPorIcmFcp = Number(fcpIcm.VL_PORICMFCPUFDEST);
    }

    // 3.11 Cálculo dos Valores do ICMS Normal (CALCICMS L464-L485)
    let vlIcmbc = round(vlPretot + vlFreteUni, 2);
    if (retornaSet('FATURAMENTO.ICMSCOMSEGDESPESA', 'N', 0) === 1) {
      vlIcmbc += vlDespesasUni + vlSeguroUni;
    }

    // IPI somado na base do ICMS (TB_DESTINOMERCADORIA: TG_IPISOMABCICMS = 1)
    if (dest.TG_IPISOMABCICMS === 1 && vlIpi > 0) {
      vlIcmbc = round(vlIcmbc + vlIpi, 2);
      logFormula(
        'ICMS',
        'IPI Somado na Base do ICMS (Destino da Mercadoria)',
        'Base ICMS + Valor IPI',
        `${round(vlIcmbc - vlIpi, 2)} + ${vlIpi}`,
        vlIcmbc
      );
    }

    // Aplicação da Redução de Base
    if (vlPorIcmRbbc > 0) {
      const bcSemReducao = vlIcmbc;
      vlIcmbc = round(vlIcmbc * (1 - vlPorIcmRbbc / 100), 2);
      logFormula(
        'ICMS',
        'Redução da Base de ICMS',
        'Base × (1 - (Redução % / 100))',
        `${bcSemReducao} × (1 - (${vlPorIcmRbbc} / 100))`,
        vlIcmbc
      );
    }

    // Cálculo do imposto
    let vlIcm = 0;
    if (vlPorIcm > 0) {
      vlIcm = round((vlIcmbc * vlPorIcm) / 100, 2);
      logFormula('ICMS', 'Valor do ICMS Normal', 'Base ICMS × (Alíquota / 100)', `${vlIcmbc} × (${vlPorIcm} / 100)`, vlIcm);
    } else {
      vlIcmbc = 0;
      vlIcm = 0;
    }

    // FCP
    let vlIcmFcpBc = vlIcmbc;
    let vlIcmFcp = 0;
    if (vlPorIcmFcp > 0 && vlIcm > 0) {
      vlIcmFcp = round((vlIcmFcpBc * vlPorIcmFcp) / 100, 2);
      logFormula('ICMS', 'Valor do FCP', 'Base FCP × (Alíquota FCP / 100)', `${vlIcmFcpBc} × (${vlPorIcmFcp} / 100)`, vlIcmFcp);
    } else {
      vlPorIcmFcp = 0;
      vlIcmFcpBc = 0;
    }

    // Diferimento
    let vlIcmBcDed = 0;
    let vlIcmDed = 0;
    if (vlPorIcmDed > 0) {
      vlIcmBcDed = round(vlPretot + vlFreteUni, 2);
      if (dest.TG_IPISOMABCICMS === 1) vlIcmBcDed = round(vlIcmBcDed + vlIpi, 2);
      if (vlPorIcmRbbcDed > 0) vlIcmBcDed = round(vlIcmBcDed * (1 - vlPorIcmRbbcDed / 100), 2);
      vlIcmDed = round((vlIcmBcDed * vlPorIcmDed) / 100, 2);
      logFormula('ICMS', 'Valor Diferido / Deduzido do ICMS', 'Base de Dedução × (Alíquota / 100)', `${vlIcmBcDed} × (${vlPorIcmDed} / 100)`, vlIcmDed);
    }

    // 3.12 Cálculo dos Valores de ICMS-ST (L531-L590)
    let vlIcmBcSt = 0;
    let vlIcmSt = 0;
    let vlIcmFcpBcSt = 0;
    let vlIcmFcpSt = 0;

    if (vlPorIcmSt > 0) {
      if (vlBaseArbitrada > 0) {
        vlIcmBcSt = round(vlBaseArbitrada * qtMovimento, 2);
        logFormula('ICMS-ST', 'Base ST por Pauta / Valor Arbitrado', 'Pauta × Quantidade', `${vlBaseArbitrada} × ${qtMovimento}`, vlIcmBcSt);
      } else {
        const baseStSemMva = round(vlPretot + vlFreteUni + vlIpi, 2);
        vlIcmBcSt = vlPorIcmVaBcSt > 0
          ? round(baseStSemMva * (1 + vlPorIcmVaBcSt / 100), 2)
          : baseStSemMva;
        logFormula(
          'ICMS-ST',
          'Base ICMS-ST',
          '(Produtos + Frete + IPI) × (1 + MVA % / 100)',
          `(${vlPretot} + ${vlFreteUni} + ${vlIpi}) × (1 + ${vlPorIcmVaBcSt} / 100)`,
          vlIcmBcSt
        );
      }

      if (vlPorIcmRbbcSt > 0) {
        const bcStSemReducao = vlIcmBcSt;
        vlIcmBcSt = round(vlIcmBcSt * (1 - vlPorIcmRbbcSt / 100), 2);
        logFormula('ICMS-ST', 'Redução Base ST', 'Base ST × (1 - Redução ST / 100)', `${bcStSemReducao} × (1 - ${vlPorIcmRbbcSt} / 100)`, vlIcmBcSt);
      }

      const auxIcmSt = round((vlIcmBcSt * vlPorIcmSt) / 100, 2);
      const icmsOperacao = round(vlIcm + vlIcmDed, 2);
      vlIcmSt = tgSemIcmsOperacao === 1 ? auxIcmSt : round(auxIcmSt - icmsOperacao, 2);

      logFormula(
        'ICMS-ST',
        'Valor ICMS-ST',
        tgSemIcmsOperacao === 1 ? 'Base ST × Alíquota ST' : '(Base ST × Alíquota ST) - ICMS da Operação',
        tgSemIcmsOperacao === 1 ? `${vlIcmBcSt} × ${vlPorIcmSt}%` : `(${vlIcmBcSt} × ${vlPorIcmSt}%) - ${icmsOperacao}`,
        vlIcmSt
      );

      // FCP ST
      if (vlPorIcmFcpSt > 0) {
        vlIcmFcpBcSt = vlIcmBcSt;
        vlIcmFcpSt = round((vlIcmFcpBcSt * vlPorIcmFcpSt) / 100, 2);
        logFormula('ICMS-ST', 'Valor FCP ST', 'Base FCP ST × Alíquota FCP ST', `${vlIcmFcpBcSt} × ${vlPorIcmFcpSt}%`, vlIcmFcpSt);
      }
    }

    // Para CST 51, o abatimento ocorre depois da ST (linhas 690-700 do PRG).
    if (nrSittribIcms.slice(1).trim() === '51' && vlIcm > 0) {
      vlIcmBcDed = vlIcm;
      vlIcmDed = round(vlIcm * (vlPorIcmDed / 100), 2);
      vlIcm = round(vlIcm - vlIcmDed, 2);
      logFormula('ICMS', 'Diferimento CST 51', 'ICMS × (Diferimento % / 100)', `${vlIcmBcDed} × (${vlPorIcmDed} / 100)`, vlIcmDed);
    }

    // 3.13 DIFAL Interestadual Consumidor Final (L600-L660)
    let vlIcmBcUfDest = 0;
    let vlPorIcmUfDest = Number(cursors.tmpIcmUfDest?.VL_PORICM || 0);
    let vlPorIcmUfEnv = Number(icm.VL_PORICM || 0);
    let vlPorIcmUfPart = 100; // 100% destino (desde 2019)
    let vlIcmUfDest = 0;
    let vlIcmUfRem = 0;
    let vlPorIcmFcpUfDest = Number(cursors.tmpIcmUfDest?.VL_PORICMFCP || 0);
    let vlIcmFcpUfDest = 0;

    const isOperacaoInterestadual = cabecalho.tgOperacao === 2 || (cabecalho.dsUf && emp.DS_UF && cabecalho.dsUf !== emp.DS_UF);
    const isConsumidorFinalNaoContribuinte = cad.TG_CONTRIBUINTEICMS === 0;

    if (isOperacaoInterestadual && isConsumidorFinalNaoContribuinte && vlPorIcmUfDest > 0 && cfo.TG_NAOCALCUFDEST === 0) {
      vlIcmBcUfDest = vlIcmbc;
      const icmInter = round((vlIcmBcUfDest * vlPorIcmUfEnv) / 100, 2);
      const icmDest = round((vlIcmBcUfDest * vlPorIcmUfDest) / 100, 2);
      const difalTotal = round(Math.max(0, icmDest - icmInter), 2);
      vlIcmUfDest = difalTotal; // 100% destino

      if (vlPorIcmFcpUfDest > 0) {
        vlIcmFcpUfDest = round((vlIcmBcUfDest * vlPorIcmFcpUfDest) / 100, 2);
      }

      logFormula(
        'DIFAL',
        'DIFAL Partilha Destino (EC 87/15)',
        '(Base × Alíquota Destino) - (Base × Alíquota Interestadual)',
        `(${vlIcmBcUfDest} × ${vlPorIcmUfDest}%) - (${vlIcmBcUfDest} × ${vlPorIcmUfEnv}%)`,
        vlIcmUfDest
      );
    }

    // =========================================================================
    // --- 4. CÁLCULO DO PIS E COFINS (L3491-L3721 e L737-L890) ---
    // =========================================================================
    // --- 4. CÁLCULO DO PIS E COFINS (L3491-L3721 e L737-L890) ---
    // =========================================================================
    // 4.1 PIS
    let nrSittribPis = cleanStr(cfo.NR_SITTRIBPIS);
    let pisTributando = Number(cfo.TG_PIS ?? 0) === 1;
    let vlPorPis = cfo.TG_IMPORTACAO === 1 && cf.VL_PORPISIMP ? Number(cf.VL_PORPISIMP) : Number(cf.VL_PORPIS || 0);
    let pisWinner = 'CFOP Base';

    if (pisTributando) {
      if (notEmpty(cfExPis.CD_SITTRIBUTARIA)) {
        nrSittribPis = cleanStr(cfExPis.CD_SITTRIBUTARIA);
        vlPorPis = Number(cfExPis.VL_PORICMS ?? 0);
        pisTributando = Number(cfExPis.TG_PIS ?? 0) === 1;
        if (Number(cfExPis.FK_INFCOMPL ?? 0) > 0) addInfCompl(cfExPis.FK_INFCOMPL, 'Exceção PIS NCM/UF', 'TB_CLAFISEXC');
        pisWinner = 'Exceção NCM/UF PIS (TB_CLAFISEXC)';
      }
      if (pisTributando && notEmpty(pro.NR_SITTRIBPIS)) {
        nrSittribPis = cleanStr(pro.NR_SITTRIBPIS);
        pisTributando = Number(pro.TG_PIS ?? 0) === 1;
        pisWinner = 'Cadastro do Produto (TB_PRODUTOS)';
      }
      if (pisTributando && Number(cad.TG_PIS ?? 0) === 1) {
        nrSittribPis = cleanStr(cad.NR_SITTRIBPIS);
        pisTributando = Number(cad.TG_PISTRIB ?? 0) === 1;
        if (Number(cad.FK_INFCOMPLPIS ?? 0) > 0) addInfCompl(cad.FK_INFCOMPLPIS, 'Isenção Cliente PIS', 'TB_CADUNICO');
        pisWinner = 'Isenção Cliente (TB_CADUNICO)';
      }
      if (pisTributando && Number(emp.TG_ISENTOPIS ?? 0) === 1) {
        nrSittribPis = cleanStr(emp.NR_SITTRIBPIS);
        pisTributando = Number(emp.TG_PIS ?? 0) === 1;
        if (Number(emp.FK_INFCOMPLPIS ?? 0) > 0) addInfCompl(emp.FK_INFCOMPLPIS, 'Isenção Empresa PIS', 'TB_EMPRESAS');
        pisWinner = 'Isenção Empresa (TB_EMPRESAS)';
      }
    }

    const regraPis = regrasPis.find(r => cleanStr(r.TG_IMPOSTO).toUpperCase() === 'PIS');
    if (pisTributando && regraPis) {
      if (notEmpty(regraPis.CD_SITRIBUTARIA)) {
        nrSittribPis = cleanStr(regraPis.CD_SITRIBUTARIA);
        vlPorPis = Number(regraPis.VL_PORIMPOSTO || 0);
        if (Number(regraPis.FK_INFCOMPL ?? 0) > 0) addInfCompl(regraPis.FK_INFCOMPL, 'Regra Imposto PIS', 'TB_REGRAIMPOSTO');
        pisWinner = 'Regra de Imposto (TB_REGRAIMPOSTO)';
      }
      if (nrSittribPis === '01' && vlPorPis !== 1.65 && vlPorPis !== 0.65) {
        nrSittribPis = '02';
        pisWinner += ' (Ajuste CST: 01->02 pois Alíq != 1.65 e 0.65)';
      }
    } else {
      if (nrSittribPis === '01' && vlPorPis !== 1.65 && vlPorPis !== 0.65) {
        nrSittribPis = '02';
        pisWinner += ' (Ajuste CST: 01->02 pois Alíq != 1.65 e 0.65)';
      }
    }

    if (Number(cabecalho.tgIncentivoPis ?? 0) === 1 && Number(cad.FK_INFCOMPLPISINCT ?? 0) > 0) {
      addInfCompl(cad.FK_INFCOMPLPISINCT, 'Incentivo Fiscal PIS', 'TB_CADUNICO');
    }

    const sitPis = findTaxSituation(cursors.tmpSitTribPis, nrSittribPis, 'TB_SITTRIBPIS', 'TG_PIS');
    if (Number(sitPis.TG_PIS) !== 1) vlPorPis = 0;

    logHierarchy({
      tax: 'PIS',
      levelName: 'Hierarquia PIS',
      tableSource: pisWinner,
      recordFound: true,
      applied: true,
      cstAfter: nrSittribPis,
      rate: vlPorPis,
      reason: `Definido por: ${pisWinner}`
    });

    // Base PIS com exclusão do ICMS (Tema 69 STF)
    let vlPisBc = vlPretot;
    const semIcmsPis = tipo === 'S'
      ? retornaSet('FATURAMENTO.PISCOFINSSEMICMS', 'N', 1) === 1
      : retornaSet('FATURAMENTO.PISCOFINSSEMICMSEN', 'N', 1) === 1;

    if (semIcmsPis && vlIcm > 0) {
      vlPisBc = round(vlPisBc - vlIcm, 2);
      logFormula('PIS', 'Exclusão do ICMS da Base do PIS (Tema 69 STF)', 'Total Produto - ICMS Próprio', `${vlPretot} - ${vlIcm}`, vlPisBc);
    }
    if (retornaSet('FATURAMENTO.PISCOFINSCOMFRETE', 'N', 0) === 1) {
      vlPisBc += vlFreteUni;
    }
    vlPisBc = Math.max(0, vlPisBc);

    let vlPis = 0;
    if (vlPorPis > 0) {
      vlPis = round((vlPisBc * vlPorPis) / 100, 2);
      logFormula('PIS', 'Valor do PIS', 'Base PIS × (Alíquota / 100)', `${vlPisBc} × (${vlPorPis} / 100)`, vlPis);
    } else {
      vlPisBc = 0;
      vlPis = 0;
    }

    // 4.2 COFINS Hierarchy
    let nrSittribCofins = cleanStr(cfo.NR_SITTRIBCOFINS);
    let cofinsTributando = Number(cfo.TG_COFINS ?? 0) === 1;
    let vlPorCofins = cfo.TG_IMPORTACAO === 1 && cf.VL_PORCOFINSIMP ? Number(cf.VL_PORCOFINSIMP) : Number(cf.VL_PORCOFINS || 0);
    let cofinsWinner = 'CFOP Base';

    if (cofinsTributando) {
      if (notEmpty(cfExCofins.CD_SITTRIBUTARIA)) {
        nrSittribCofins = cleanStr(cfExCofins.CD_SITTRIBUTARIA);
        vlPorCofins = Number(cfExCofins.VL_PORICMS ?? 0);
        cofinsTributando = Number(cfExCofins.TG_COFINS ?? 0) === 1;
        if (Number(cfExCofins.FK_INFCOMPL ?? 0) > 0) addInfCompl(cfExCofins.FK_INFCOMPL, 'Exceção COFINS NCM/UF', 'TB_CLAFISEXC');
        cofinsWinner = 'Exceção NCM/UF COFINS (TB_CLAFISEXC)';
      }
      if (cofinsTributando && notEmpty(pro.NR_SITTRIBCOFINS)) {
        nrSittribCofins = cleanStr(pro.NR_SITTRIBCOFINS);
        cofinsTributando = Number(pro.TG_COFINS ?? 0) === 1;
        cofinsWinner = 'Cadastro do Produto (TB_PRODUTOS)';
      }
      if (cofinsTributando && Number(cad.TG_COFINS ?? 0) === 1) {
        nrSittribCofins = cleanStr(cad.NR_SITTRIBCOFINS);
        cofinsTributando = Number(cad.TG_COFINSTRIB ?? 0) === 1;
        if (Number(cad.FK_INFCOMPLCOFINS ?? 0) > 0) addInfCompl(cad.FK_INFCOMPLCOFINS, 'Isenção Cliente COFINS', 'TB_CADUNICO');
        cofinsWinner = 'Isenção Cliente (TB_CADUNICO)';
      }
      if (cofinsTributando && Number(emp.TG_ISENTOCOFINS ?? 0) === 1) {
        nrSittribCofins = cleanStr(emp.NR_SITTRIBCOFINS);
        cofinsTributando = Number(emp.TG_COFINS ?? 0) === 1;
        if (Number(emp.FK_INFCOMPLCOFINS ?? 0) > 0) addInfCompl(emp.FK_INFCOMPLCOFINS, 'Isenção Empresa COFINS', 'TB_EMPRESAS');
        cofinsWinner = 'Isenção Empresa (TB_EMPRESAS)';
      }
    }

    const regraCofins = regrasCofins.find(r => cleanStr(r.TG_IMPOSTO).toUpperCase() === 'COFINS');
    if (cofinsTributando && regraCofins) {
      if (notEmpty(regraCofins.CD_SITRIBUTARIA)) {
        nrSittribCofins = cleanStr(regraCofins.CD_SITRIBUTARIA);
        vlPorCofins = Number(regraCofins.VL_PORIMPOSTO || 0);
        if (Number(regraCofins.FK_INFCOMPL ?? 0) > 0) addInfCompl(regraCofins.FK_INFCOMPL, 'Regra Imposto COFINS', 'TB_REGRAIMPOSTO');
        cofinsWinner = 'Regra de Imposto (TB_REGRAIMPOSTO)';
      }
      if (nrSittribCofins === '01' && vlPorCofins !== 7.6 && vlPorCofins !== 3) {
        nrSittribCofins = '02';
        cofinsWinner += ' (Ajuste CST: 01->02 pois Alíq != 7.6 e 3)';
      }
    } else {
      if (nrSittribCofins === '01' && vlPorCofins !== 7.6 && vlPorCofins !== 3) {
        nrSittribCofins = '02';
        cofinsWinner += ' (Ajuste CST: 01->02 pois Alíq != 7.6 e 3)';
      }
    }

    if (Number(cabecalho.tgIncentivoCofins ?? 0) === 1 && Number(cad.FK_INFCOMPLCOFINSINCT ?? 0) > 0) {
      addInfCompl(cad.FK_INFCOMPLCOFINSINCT, 'Incentivo Fiscal COFINS', 'TB_CADUNICO');
    }

    const sitCofins = findTaxSituation(cursors.tmpSitTribCofins, nrSittribCofins, 'TB_SITTRIBCOFINS', 'TG_COFINS');
    if (Number(sitCofins.TG_COFINS) !== 1) vlPorCofins = 0;

    logHierarchy({
      tax: 'COFINS',
      levelName: 'Hierarquia COFINS',
      tableSource: cofinsWinner,
      recordFound: true,
      applied: true,
      cstAfter: nrSittribCofins,
      rate: vlPorCofins,
      reason: `Definido por: ${cofinsWinner}`
    });

    let vlCofinsBc = vlPretot;
    if (semIcmsPis && vlIcm > 0) {
      vlCofinsBc = round(vlCofinsBc - vlIcm, 2);
      logFormula('COFINS', 'Exclusão do ICMS da Base do COFINS (Tema 69 STF)', 'Total Produto - ICMS Próprio', `${vlPretot} - ${vlIcm}`, vlCofinsBc);
    }
    if (retornaSet('FATURAMENTO.PISCOFINSCOMFRETE', 'N', 0) === 1) {
      vlCofinsBc += vlFreteUni;
    }
    vlCofinsBc = Math.max(0, vlCofinsBc);

    let vlCofins = 0;
    if (vlPorCofins > 0) {
      vlCofins = round((vlCofinsBc * vlPorCofins) / 100, 2);
      logFormula('COFINS', 'Valor do COFINS', 'Base COFINS × (Alíquota / 100)', `${vlCofinsBc} × (${vlPorCofins} / 100)`, vlCofins);
    } else {
      vlCofinsBc = 0;
      vlCofins = 0;
    }

    // =========================================================================
    // --- 5. REFORMA TRIBUTÁRIA (IBS, CBS e IS) (L891-L1058) ---
    // =========================================================================
    let vlPorIs = Number(cursors.tmpRegraImpIs?.[0]?.VL_PORIMPOSTO || 0);
    let vlIsBc = 0;
    let vlIs = 0;

    if (vlPorIs > 0) {
      vlIsBc = round(vlPretot + vlFreteUni + vlDespesasUni - vlDesconto - vlPis - vlCofins - vlIcm, 2);
      vlIsBc = Math.max(0, vlIsBc);
      vlIs = round((vlIsBc * vlPorIs) / 100, 2);
      logFormula('IS', 'Imposto Seletivo (Reforma Tributária)', 'Base IS × Alíquota IS', `${vlIsBc} × ${vlPorIs}%`, vlIs);
    }

    // Sem regra carregada pelo mesmo fluxo FoxPro, não há alíquota de teste.
    let vlPorIbsUf = Number(cursors.tmpRegraImpIbsCbs?.[0]?.VL_PORIBSUF ?? 0);
    let vlPorCbs = Number(cursors.tmpRegraImpIbsCbs?.[0]?.VL_PORCBS ?? 0);
    let vlIbsCbsBc = round(vlPretot + vlFreteUni + vlDespesasUni - vlDesconto - vlPis - vlCofins - vlIcm + vlIs, 2);
    vlIbsCbsBc = Math.max(0, vlIbsCbsBc);

    let vlIbsUf = vlPorIbsUf > 0 ? round((vlIbsCbsBc * vlPorIbsUf) / 100, 2) : 0;
    let vlCbs = vlPorCbs > 0 ? round((vlIbsCbsBc * vlPorCbs) / 100, 2) : 0;

    if (vlIbsUf > 0 || vlCbs > 0) {
      logFormula('IBS/CBS', 'Base IBS e CBS (Reforma Tributária)', 'Total Líquido + Imposto Seletivo', `${vlIbsCbsBc}`, vlIbsCbsBc);
      logFormula('IBS', 'Valor IBS Estadual', 'Base × Alíquota IBS', `${vlIbsCbsBc} × ${vlPorIbsUf}%`, vlIbsUf);
      logFormula('CBS', 'Valor CBS Federal', 'Base × Alíquota CBS', `${vlIbsCbsBc} × ${vlPorCbs}%`, vlCbs);
    }

    // =========================================================================
    // --- 6. MONTAGEM DO RESULTADO FINAL ---
    // =========================================================================
    const memory: TaxCalculationMemory = {
      hierarchySteps,
      formulas,
      complementaryInfo,
      systemParameters,
      pyramidSummary: {
        icmsWinner,
        ipiWinner,
        pisWinner,
        cofinsWinner,
        stWinner
      }
    };

    return {
      fkProduto: item.fkProduto,
      dsProduto: pro.DS_PRODUTO || pro.DS_NOME || `Produto ${item.fkProduto}`,
      fkCfop: item.fkCfop,
      qtMovimento,
      vlUnitario,
      vlPretot,
      vlBasecalc: vlPretot,

      // ICMS Normal
      nrSittribIcms,
      vlIcmbc,
      vlPorIcm,
      vlPorIcmRbbc,
      vlIcm,
      vlPorIcmDeson,
      vlIcmDeson,
      fkMotivoDesonIcms,

      // ICMS Simples
      vlPorIcmSn: Number(emp.VL_PORICMSSN || 0),
      vlPorCredIcmSn: round(((emp.VL_PORICMSSN || 0) / 100) * vlPretot, 2),

      // FCP
      vlIcmFcpBc,
      vlPorIcmFcp,
      vlIcmFcp,

      // Diferimento
      vlPorIcmDed,
      vlIcmBcDed,
      vlIcmDed,

      // ICMS ST
      vlIcmBcSt,
      vlPorIcmVaBcSt,
      vlPorIcmSt,
      vlPorIcmRbbcSt,
      vlIcmSt,
      vlBaseArbitrada,
      nrCest,

      // FCP ST
      vlIcmFcpBcSt,
      vlPorIcmFcpSt,
      vlIcmFcpSt,

      // DIFAL
      vlIcmBcUfDest,
      vlPorIcmUfDest,
      vlPorIcmUfEnv,
      vlPorIcmUfPart,
      vlIcmUfDest,
      vlIcmUfRem,
      vlPorIcmFcpUfDest,
      vlIcmFcpUfDest,

      // IPI
      nrSittribIpi,
      fkEnquadramentoIpi,
      vlIpiBc,
      vlPorIpi,
      vlIpi,
      vlIpiPorUnidade,

      // PIS
      nrSittribPis,
      vlPisBc,
      vlPorPis,
      vlPis,

      // COFINS
      nrSittribCofins,
      vlCofinsBc,
      vlPorCofins,
      vlCofins,

      // Reforma
      vlIsBc,
      vlPorIs,
      vlIs,
      vlIbsCbsBc,
      vlPorIbsUf,
      vlIbsUf,
      vlPorIbsMun: 0,
      vlIbsMun: 0,
      vlPorCbs,
      vlCbs,

      cdBenefis,
      memory
    };
  }
}
