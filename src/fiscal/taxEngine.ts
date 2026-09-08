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
    const regrasIcm = cursors.tmpRegraImpIcm || [];
    const regrasIpi = cursors.tmpRegraImpIpi || [];
    const regrasPis = cursors.tmpRegraImpPis || [];
    const regrasCofins = cursors.tmpRegraImpCofins || [];

    // --- 1. VALIDAÇÃO INICIAL (L16-L52) ---
    const tipo = (cabecalho.tipo || 'S').toUpperCase() as 'S' | 'E';
    const regime = Number(cabecalho.tgRegime || emp.TG_REGIME || (emp.TG_CRT === 1 || emp.TG_CRT === 2 ? 2 : 1)); // 1=Normal, 2=Simples
    const qtMovimento = Number(item.qtMovimento || 1);
    const vlUnitario = Number(item.vlUnitario || 0);
    const vlPretot = item.vlTotal !== undefined && item.vlTotal !== null && item.vlTotal > 0
      ? round(item.vlTotal, 2)
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

    // Origem do produto (0=Nacional, 1=Estrangeira Direta, 2=Estrangeira Adq. Mercado Interno, etc.)
    const tgOrigemIcms = String(pro.TG_ORIGEMICMS ?? '0').trim();

    // =========================================================================
    // --- 2. CÁLCULO DO IPI (L3368-L3490 e L230-L340) ---
    // =========================================================================
    let nrSittribIpi = String(cfo.NR_SITTRIBIPI || '').trim();
    let fkEnquadramentoIpi = String(cfo.FK_ENQUADRAMENTOIPI || '').trim();
    let vlPorIpi = Number(cf.VL_PORIPI || pro.VL_PORIPI || 0);
    let vlIpiPorUnidade = 0;
    let ipiTributando = Number(cfo.TG_IPI ?? 0) === 1;
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

    // Exceção NCM (TB_CLAFIS)
    if (cf.PK_ID) {
      const cstNcmIpi = tipo === 'S' ? String(cf.NR_SITTRIBIPISAI || '').trim() : String(cf.NR_SITTRIBIPIENT || '').trim();
      if (cstNcmIpi && ipiTributando) {
        nrSittribIpi = cstNcmIpi;
        if (cf.VL_PORIPI !== undefined && cf.VL_PORIPI > 0) vlPorIpi = Number(cf.VL_PORIPI);
        ipiWinner = 'NCM (TB_CLAFIS)';
        logHierarchy({
          tax: 'IPI',
          levelName: '2. NCM / Classificação Fiscal',
          tableSource: 'TB_CLAFIS',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIpi,
          rate: vlPorIpi,
          reason: `NCM configurou CST ${nrSittribIpi} e Alíquota ${vlPorIpi}%`
        });
      }
    }

    // Exceção Produto (TB_PRODUTOS)
    if (pro.NR_SITTRIBIPI && ipiTributando) {
      nrSittribIpi = String(pro.NR_SITTRIBIPI).trim();
      if (pro.VL_PORIPI !== undefined && pro.VL_PORIPI > 0) vlPorIpi = Number(pro.VL_PORIPI);
      ipiWinner = 'Cadastro do Produto (TB_PRODUTOS)';
      logHierarchy({
        tax: 'IPI',
        levelName: '3. Produto',
        tableSource: 'TB_PRODUTOS',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIpi,
        rate: vlPorIpi,
        reason: `Produto configurou CST ${nrSittribIpi} e Alíquota ${vlPorIpi}%`
      });
    }

    // Isenção Cliente (TB_CADUNICO)
    if (cad.TG_ISENTOIPI === 1 && ipiTributando) {
      nrSittribIpi = String(cad.NR_SITTRIBIPI || (tipo === 'S' ? '52' : '02')).trim();
      vlPorIpi = 0;
      ipiTributando = false;
      ipiWinner = 'Isenção Cliente (TB_CADUNICO)';
      logHierarchy({
        tax: 'IPI',
        levelName: '4. Isenção Cliente',
        tableSource: 'TB_CADUNICO',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIpi,
        rate: 0,
        reason: 'Cliente configurado como isento de IPI'
      });
    }

    // Isenção Empresa (TB_EMPRESAS)
    if (emp.TG_ISENTOIPI === 1 && ipiTributando) {
      nrSittribIpi = String(emp.NR_SITTRIBIPI || (tipo === 'S' ? '52' : '02')).trim();
      vlPorIpi = 0;
      ipiTributando = false;
      ipiWinner = 'Isenção Empresa Emitente (TB_EMPRESAS)';
      logHierarchy({
        tax: 'IPI',
        levelName: '5. Isenção Empresa',
        tableSource: 'TB_EMPRESAS',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIpi,
        rate: 0,
        reason: 'Empresa emitente configurada como isenta de IPI'
      });
    }

    // Regra de Imposto de IPI (TB_REGRAIMPOSTO)
    const regraIpi = regrasIpi.find(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'IPI');
    if (regraIpi && regraIpi.CD_SITRIBUTARIA) {
      nrSittribIpi = String(regraIpi.CD_SITRIBUTARIA).trim();
      if (regraIpi.VL_PORIMPOSTO !== undefined) vlPorIpi = Number(regraIpi.VL_PORIMPOSTO);
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

    // Cálculo numérico do IPI
    let vlIpiBc = vlPretot;
    let vlIpi = 0;

    if (tgTransferencia === 1) {
      const lnTransferenciaIpi = retornaSet('FATURAMENTO.TRANSFMARGEMIPI', 'N', 100) || 100;
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
      if (retornaSet('VENDAS.IPICOMFRETE', 'N', 0) === 1) {
        vlIpiBc += vlFreteUni;
      }
      if (retornaSet('FATURAMENTO.IPICOMSEGDESPESA', 'N', 0) === 1) {
        vlIpiBc += vlDespesasUni + vlSeguroUni;
      }
      if (retornaSet('FATURAMENTO.IPICOMDESCONTOINCO', 'N', 0) === 1) {
        vlIpiBc -= vlDesconto;
      }
      vlIpiBc = round(Math.max(0, vlIpiBc), 2);
    }

    // Se CST não tributa ou alíquota zerada
    const isCstTributadaIpi = ['00', '49', '50', '99'].includes(nrSittribIpi);
    if (isCstTributadaIpi && vlPorIpi > 0) {
      vlIpi = round((vlIpiBc * vlPorIpi) / 100, 2);
      logFormula('IPI', 'Valor do IPI', 'Base IPI × (Alíquota / 100)', `${vlIpiBc} × (${vlPorIpi} / 100)`, vlIpi);
    } else {
      vlIpiBc = 0;
      vlIpi = 0;
    }

    // =========================================================================
    // --- 3. CÁLCULO DO ICMS (L2910-L3367 e L399-L736) ---
    // =========================================================================
    let nrSittribIcms = '';
    let vlPorIcmRbbc = 0;
    let vlPorIcmDeson = 0;
    let vlIcmDeson = 0;
    let fkMotivoDesonIcms = 0;
    let cdBenefis = '';
    let nrCest = '';
    let vlPorIcmFcp = 0;
    let vlPorIcmDed = 0; // Diferimento %
    let icmsWinner = 'CFOP';

    // 3.1 Nível 1: CFOP
    const cstCfop = regime === 2
      ? String(cfo.NR_SITTRIBICMSSN || '102').trim()
      : String(cfo.NR_SITTRIBICMS || '00').trim();

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

    const sitTribList: any[] = cursors.tmpSitTributariaIcms || [];

    // Helper: verifica se a situação tributária atual calcula ICMS
    // No FoxPro:
    // SELE TMPSITTRIBUTARIAICMS
    // SEEK toREGITE.NR_SITTRIB
    // IF TMPSITTRIBUTARIAICMS.TG_ICMS = 1
    const tributaIcms = (cstCompleto: string): boolean => {
      const cleanCst = cstCompleto.trim();
      const sufixo = cleanCst.length >= 2 ? cleanCst.slice(-2) : cleanCst;
      const sufixo3 = cleanCst.length >= 3 ? cleanCst.slice(-3) : cleanCst;

      // 1. Procura na tabela de situação tributária real do banco (TB_SITTRIBUTARIA)
      const sit = sitTribList.find((s: any) => {
        const pk = String(s.PK_ID ?? '').trim();
        return pk === cleanCst || pk === sufixo || pk === sufixo3 || (parseInt(pk, 10) === parseInt(sufixo, 10) && !isNaN(parseInt(sufixo, 10)));
      });

      if (sit && sit.TG_ICMS !== undefined && sit.TG_ICMS !== null) {
        return Number(sit.TG_ICMS) === 1;
      }

      // 2. Fallback padrão da legislação se não estiver no cursor
      if (regime === 2) {
        return ['101', '201'].includes(sufixo3);
      }
      // No regime normal, CST 90 / 090 NÃO TRIBUTA (TG_ICMS = 0)
      return ['00', '10', '20', '70'].includes(sufixo);
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
      if (pro.TG_ISENTOICMS === 1) {
        const cstIsento = regime === 2 ? '102' : '40';
        nrSittribIcms = tgOrigemIcms + cstIsento;
        icmsWinner = 'Produto Isento (TB_PRODUTOS)';
        logHierarchy({
          tax: 'ICMS',
          levelName: '4. Produto',
          tableSource: 'TB_PRODUTOS',
          recordFound: true,
          applied: true,
          cstAfter: nrSittribIcms,
          reason: 'Produto configurado com Isenção de ICMS no cadastro'
        });
      } else if (pro.CD_SITTRIBUTARIA && !cfEx.CD_SITTRIBUTARIA && !cfExCad.CD_SITTRIBUTARIA) {
        // CST do Produto só aplica se não tiver exceção anterior
        const cstProd = regime === 2 ? String(pro.CD_SITTRIBUTARIASN || '102').trim() : String(pro.CD_SITTRIBUTARIA).trim();
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

    // 3.5 Nível 5: Empresa Emitente (TB_EMPRESAS)
    if (tributaIcms(nrSittribIcms) && emp.TG_ISENTOICMS === 1) {
      nrSittribIcms = tgOrigemIcms + String(emp.NR_SITTRIBICMS || (regime === 2 ? '102' : '40')).trim();
      icmsWinner = 'Empresa Emitente Isenta (TB_EMPRESAS)';
      logHierarchy({
        tax: 'ICMS',
        levelName: '5. Empresa Emitente',
        tableSource: 'TB_EMPRESAS',
        recordFound: true,
        applied: true,
        cstAfter: nrSittribIcms,
        reason: 'Empresa emitente cadastrada com isenção de ICMS'
      });
    } else if (!tributaIcms(nrSittribIcms) && emp.TG_ISENTOICMS === 1) {
      logHierarchy({
        tax: 'ICMS',
        levelName: '5. Empresa Emitente',
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
        levelName: '6. Regra de Imposto Dinâmica',
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
        levelName: '6. Regra de Imposto Dinâmica',
        tableSource: 'TB_REGRAIMPOSTO',
        recordFound: true,
        applied: false,
        reason: `Nível ignorado: CST atual (${nrSittribIcms}) é não-tributada / isenta (TG_ICMS = 0). Regra FoxPro: 'primeira isenção encontrada deve permanecer'.`
      });
    }

    // 3.7 Apuração da Alíquota de ICMS (RETORNARICMS L1154-L1242)
    let vlPorIcm = 0;
    if (tipo === 'S') {
      if (cad.TG_PESSOA === 'F') {
        vlPorIcm = Number(icm.VL_PORICMCONS || icm.VL_PORICM || 0);
      } else {
        vlPorIcm = cad.TG_CONTRIBUINTEICMS === 1
          ? Number(icm.VL_PORICM || 0)
          : Number(icm.VL_PORICMCONS || icm.VL_PORICM || 0);
      }
    } else {
      vlPorIcm = emp.TG_CONTRIBUINTEICMS === 1
        ? Number(icm.VL_PORICM || 0)
        : Number(icm.VL_PORICMCONS || icm.VL_PORICM || 0);
    }

    // Sobrescrita da alíquota pelas exceções
    if (cfEx.VL_PORICMS !== undefined && cfEx.VL_PORICMS > 0) {
      vlPorIcm = Number(cfEx.VL_PORICMS);
    }
    if (cfExCad.VL_PORICMS !== undefined && cfExCad.VL_PORICMS > 0 && regime === 1) {
      vlPorIcm = Number(cfExCad.VL_PORICMS);
    }
    if (regraIcms && regraIcms.VL_PORIMPOSTO !== undefined && regraIcms.VL_PORIMPOSTO > 0 && regime === 1) {
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

    // L3209 do NFE_CALCULARITEM.PRG:
    // IF tcTIPO = 'S' AND TMPCALSTICMS.TG_ICMS = 0: toREGITE.VL_PORICM = 0
    if (!tributaIcms(nrSittribIcms)) {
      vlPorIcm = 0;
    }

    // Cálculo do imposto
    let vlIcm = 0;
    if (tributaIcms(nrSittribIcms) && vlPorIcm > 0) {
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
    let vlIcmBcDed = vlIcmbc;
    let vlIcmDed = 0;
    if (vlPorIcmDed > 0 && vlIcm > 0) {
      vlIcmDed = round((vlIcm * vlPorIcmDed) / 100, 2);
      logFormula('ICMS', 'Valor Diferido do ICMS', 'ICMS × (Diferimento % / 100)', `${vlIcm} × (${vlPorIcmDed} / 100)`, vlIcmDed);
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
      vlIcmSt = stDeducaoIcms ? round(auxIcmSt - vlIcm, 2) : auxIcmSt;
      vlIcmSt = Math.max(0, vlIcmSt);

      logFormula(
        'ICMS-ST',
        'Valor ICMS-ST',
        stDeducaoIcms ? '(Base ST × Alíquota ST) - ICMS Próprio' : 'Base ST × Alíquota ST',
        stDeducaoIcms ? `(${vlIcmBcSt} × ${vlPorIcmSt}%) - ${vlIcm}` : `${vlIcmBcSt} × ${vlPorIcmSt}%`,
        vlIcmSt
      );

      // FCP ST
      if (vlPorIcmFcpSt > 0) {
        vlIcmFcpBcSt = vlIcmBcSt;
        vlIcmFcpSt = round((vlIcmFcpBcSt * vlPorIcmFcpSt) / 100, 2);
        logFormula('ICMS-ST', 'Valor FCP ST', 'Base FCP ST × Alíquota FCP ST', `${vlIcmFcpBcSt} × ${vlPorIcmFcpSt}%`, vlIcmFcpSt);
      }
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
    // 4.1 PIS Hierarchy
    let nrSittribPis = String(cfo.NR_SITTRIBPIS || '').trim();
    let pisTributando = Number(cfo.TG_PIS ?? 0) === 1;
    let vlPorPis = cfo.TG_IMPORTACAO === 1 && cf.VL_PORPISIMP ? Number(cf.VL_PORPISIMP) : Number(cf.VL_PORPIS || 0);
    let pisWinner = 'CFOP Base';

    if (pisTributando) {
      if (pro.NR_SITTRIBPIS) {
        nrSittribPis = String(pro.NR_SITTRIBPIS).trim();
        pisTributando = Number(pro.TG_PIS ?? 0) === 1;
        pisWinner = 'Cadastro do Produto (TB_PRODUTOS)';
      }
      if (pisTributando && cad.TG_ISENTOPIS === 1) {
        nrSittribPis = String(cad.NR_SITTRIBPIS || '08').trim();
        pisTributando = Number(cad.TG_PISTRIB ?? 0) === 1;
        pisWinner = 'Isenção Cliente (TB_CADUNICO)';
      }
      if (pisTributando && emp.TG_ISENTOPIS === 1) {
        nrSittribPis = String(emp.NR_SITTRIBPIS || '08').trim();
        pisTributando = Number(emp.TG_PIS ?? 0) === 1;
        pisWinner = 'Isenção Empresa (TB_EMPRESAS)';
      }
    }

    const regraPis = regrasPis.find(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'PIS');
    if (pisTributando && regraPis) {
      if (regraPis.CD_SITRIBUTARIA) {
        nrSittribPis = String(regraPis.CD_SITRIBUTARIA).trim();
        vlPorPis = Number(regraPis.VL_PORIMPOSTO || 0);
        pisWinner = 'Regra de Imposto (TB_REGRAIMPOSTO)';
      }
      if (nrSittribPis === '01' && vlPorPis !== 1.65 && vlPorPis !== 0.65) {
        nrSittribPis = '02';
      }
    } else {
      if (nrSittribPis === '01' && vlPorPis !== 1.65 && vlPorPis !== 0.65) {
        nrSittribPis = '02';
      }
    }

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
    if (vlPorPis > 0 && nrSittribPis !== '08' && nrSittribPis !== '04' && nrSittribPis !== '06' && nrSittribPis !== '07' && nrSittribPis !== '09') {
      vlPis = round((vlPisBc * vlPorPis) / 100, 2);
      logFormula('PIS', 'Valor do PIS', 'Base PIS × (Alíquota / 100)', `${vlPisBc} × (${vlPorPis} / 100)`, vlPis);
    } else {
      vlPisBc = 0;
      vlPis = 0;
    }

    // 4.2 COFINS Hierarchy
    let nrSittribCofins = String(cfo.NR_SITTRIBCOFINS || '').trim();
    let cofinsTributando = Number(cfo.TG_COFINS ?? 0) === 1;
    let vlPorCofins = cfo.TG_IMPORTACAO === 1 && cf.VL_PORCOFINSIMP ? Number(cf.VL_PORCOFINSIMP) : Number(cf.VL_PORCOFINS || 0);
    let cofinsWinner = 'CFOP Base';

    if (cofinsTributando) {
      if (pro.NR_SITTRIBCOFINS) {
        nrSittribCofins = String(pro.NR_SITTRIBCOFINS).trim();
        cofinsTributando = Number(pro.TG_COFINS ?? 0) === 1;
        cofinsWinner = 'Cadastro do Produto (TB_PRODUTOS)';
      }
      if (cofinsTributando && cad.TG_ISENTOCOFINS === 1) {
        nrSittribCofins = String(cad.NR_SITTRIBCOFINS || '08').trim();
        cofinsTributando = Number(cad.TG_COFINSTRIB ?? 0) === 1;
        cofinsWinner = 'Isenção Cliente (TB_CADUNICO)';
      }
      if (cofinsTributando && emp.TG_ISENTOCOFINS === 1) {
        nrSittribCofins = String(emp.NR_SITTRIBCOFINS || '08').trim();
        cofinsTributando = Number(emp.TG_COFINS ?? 0) === 1;
        cofinsWinner = 'Isenção Empresa (TB_EMPRESAS)';
      }
    }

    const regraCofins = regrasCofins.find(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'COFINS');
    if (cofinsTributando && regraCofins) {
      if (regraCofins.CD_SITRIBUTARIA) {
        nrSittribCofins = String(regraCofins.CD_SITRIBUTARIA).trim();
        vlPorCofins = Number(regraCofins.VL_PORIMPOSTO || 0);
        cofinsWinner = 'Regra de Imposto (TB_REGRAIMPOSTO)';
      }
      if (nrSittribCofins === '01' && vlPorCofins !== 7.6 && vlPorCofins !== 3) {
        nrSittribCofins = '02';
      }
    } else {
      if (nrSittribCofins === '01' && vlPorCofins !== 7.6 && vlPorCofins !== 3) {
        nrSittribCofins = '02';
      }
    }

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
    if (vlPorCofins > 0 && nrSittribCofins !== '08' && nrSittribCofins !== '04' && nrSittribCofins !== '06' && nrSittribCofins !== '07' && nrSittribCofins !== '09') {
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

    let vlPorIbsUf = Number(cursors.tmpRegraImpIbsCbs?.[0]?.VL_PORIBSUF || 0.1); // alíquota teste 2026
    let vlPorCbs = Number(cursors.tmpRegraImpIbsCbs?.[0]?.VL_PORCBS || 0.9); // alíquota teste 2026
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
