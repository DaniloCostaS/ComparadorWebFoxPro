/**
 * Carregador e orquestrador de dados fiscais via SQL Server (ABREARQCALC)
 */

import type { ItemFiscalInput, CabecalhoFiscalInput, SimulationPayload } from './types';

export class SqlDataLoader {
  /**
   * Monta o script de consultas unificado correspondente ao ABREARQCALC do FoxPro
   */
  public static buildAbreArqCalcScript(item: ItemFiscalInput, cab: CabecalhoFiscalInput): string {
    const cfop = Number(item.fkCfop);
    const produto = String(item.fkProduto).replace(/'/g, '');
    const empresa = String(cab.fkEmpresa).replace(/'/g, '');
    const cliente = Number(cab.fkCadunico);
    const uf = String(cab.dsUf).replace(/'/g, '').toUpperCase();

    return `
      -- 1. CFOP
      SELECT
        CFO.PK_ID, CFO.TG_IMPORTACAO, CFO.TG_TRANSFERENCIA, CFO.FK_INFCOMPL,
        CFO.NR_SITTRIBICMS, CFO.NR_SITTRIBICMSSN, CFO.NR_SITTRIBIPI,
        CFO.FK_ENQUADRAMENTOIPI, CFO.NR_SITTRIBCOFINS, CFO.NR_SITTRIBPIS,
        CFO.TG_NAOCALCSUBSICMS, CFO.FK_GRUPO, CFO.TG_NAOCALCUFDEST,
        COALESCE(CFO.TG_TIPO,'') AS TG_TIPO,
        COALESCE(GRU.TG_VENDA,0) AS TG_VENDA,
        COALESCE(CFO.FK_MOTIVODESONICMS,0) AS FK_MOTIVODESONICMS,
        COALESCE(CFO.TG_NAOCALCICMSDESON,0) AS TG_NAOCALCICMSDESON,
        COALESCE(CFO.TG_NAOCALCICMSDIF,0) AS TG_NAOCALCICMSDIF,
        COALESCE(CFO.TG_NAOCALCICMSFCP,0) AS TG_NAOCALCICMSFCP,
        COALESCE(CFO.TG_NAOCALCICMSFCPST,0) AS TG_NAOCALCICMSFCPST,
        COALESCE(IPI.TG_IPI,0) AS TG_IPI,
        COALESCE(PIS.TG_PIS,0) AS TG_PIS,
        COALESCE(COFINS.TG_COFINS,0) AS TG_COFINS
      FROM TB_CFOP AS CFO
      LEFT JOIN TB_CFOPGRUPOS AS GRU ON GRU.PK_ID = CFO.FK_GRUPO
      LEFT JOIN TB_SITTRIBIPI AS IPI ON IPI.PK_ID = CFO.NR_SITTRIBIPI 
      LEFT JOIN TB_SITTRIBPIS AS PIS ON PIS.PK_ID = CFO.NR_SITTRIBPIS
      LEFT JOIN TB_SITTRIBCOFINS AS COFINS ON COFINS.PK_ID = CFO.NR_SITTRIBCOFINS
      WHERE CFO.PK_ID = ${cfop};

      -- 2. EXCEÇÃO POR UF DE CFOP
      SELECT
        COALESCE(INF.FK_INFCOMPL,0) AS FK_INFCOMPL,
        COALESCE(INF.NR_SITTRIBICMS,'') AS NR_SITTRIBICMS,
        COALESCE(INF.NR_SITTRIBICMSSN,'') AS NR_SITTRIBICMSSN,
        COALESCE(INF.NR_SITTRIBPIS,'') AS NR_SITTRIBPIS,
        COALESCE(INF.NR_SITTRIBCOFINS,'') AS NR_SITTRIBCOFINS,
        COALESCE(INF.NR_SITTRIBIPI,'') AS NR_SITTRIBIPI,
        COALESCE(INF.FK_ENQUADRAMENTOIPI,'') AS FK_ENQUADRAMENTOIPI,
        COALESCE(INF.FK_MOTIVODESONICMS,0) AS FK_MOTIVODESONICMS,
        COALESCE(INF.CD_BENEFIS, '') AS CD_BENEFIS
      FROM FT_INFCOMPLCFOP AS INF
      WHERE INF.FK_CFOP = ${cfop}
        AND INF.FK_UFORIGEM = '${uf}'
        AND INF.TG_INATIVO = 0;

      -- 3. PRODUTO
      SELECT TOP 1
        PRO.PK_ID, PRO.DS_PRODUTO, PRO.DS_NOME, PRO.FK_CLAFIS, PRO.CD_SITTRIBUTARIA, PRO.CD_SITTRIBUTARIASN,
        PRO.TG_ORIGEMICMS, PRO.NR_SITTRIBIPI, PRO.VL_PORIPI, PRO.NR_SITTRIBPIS, PRO.VL_PORPIS,
        PRO.NR_SITTRIBCOFINS, PRO.VL_PORCOFINS, PRO.TG_ISENTOICMS, PRO.TG_ORIGEMIMP,
        PRO.VL_PRETAB1, PRO.VL_PRETAB2, PRO.VL_PRETAB3, PRO.VL_PRETAB4, PRO.VL_PRETAB5, PRO.VL_PRETAB6
      FROM TB_PRODUTOS PRO
      WHERE PRO.PK_ID = '${produto}';

      -- 4. EMPRESA EMITENTE
      SELECT TOP 1
        EMP.PK_ID, EMP.DS_FANTASIA, EMP.DS_EMPRESA, EMP.DS_UF, EMP.TG_REGIME, EMP.TG_CRT,
        EMP.TG_CONTRIBUINTEICMS, EMP.TG_ISENTOICMS, EMP.TG_ISENTOIPI, EMP.TG_ISENTOPIS, EMP.TG_ISENTOCOFINS,
        EMP.NR_SITTRIBICMS, EMP.VL_PORICMSSN
      FROM TB_EMPRESAS EMP
      WHERE EMP.PK_ID = '${empresa}';

      -- 5. CLIENTE / DESTINATÁRIO
      SELECT TOP 1
        CAD.PK_ID, CAD.DS_NOME, CAD.TG_PESSOA, CAD.TG_CONTRIBUINTEICMS, CAD.DS_UF,
        CAD.TG_ISENTOIPI, CAD.TG_ISENTOPIS, CAD.TG_ISENTOCOFINS
      FROM TB_CADUNICO CAD
      WHERE CAD.PK_ID = ${cliente};

      -- 6. ALÍQUOTA DE ICMS DO ESTADO
      SELECT TOP 1
        ICM.VL_PORICM, ICM.VL_PORICMCONS
      FROM TB_ICMS ICM
      WHERE ICM.FK_ESTADO = '${uf}';

      -- 7. NCM / CLASSIFICAÇÃO FISCAL
      SELECT TOP 1
        CF.PK_ID, CF.CD_CLAFIS, CF.NR_SITTRIBIPISAI, CF.NR_SITTRIBIPIENT, CF.VL_PORIPI,
        CF.NR_SITTRIBPIS, CF.VL_PORPIS, CF.NR_SITTRIBCOFINS, CF.VL_PORCOFINS, CF.NR_CEST
      FROM TB_CLAFIS CF
      INNER JOIN TB_PRODUTOS PRO ON PRO.FK_CLAFIS = CF.PK_ID
      WHERE PRO.PK_ID = '${produto}';

      -- 8. EXCEÇÃO NCM POR UF
      SELECT TOP 1
        EXC.PK_ID, EXC.CD_SITTRIBUTARIA, EXC.VL_PORREDUICMS, EXC.VL_PORICMS, EXC.NR_CEST,
        EXC.CD_BENEFIS, EXC.FK_INFCOMPL, EXC.NR_SITTRIBPIS, EXC.VL_PORPIS,
        EXC.NR_SITTRIBCOFINS, EXC.VL_PORCOFINS
      FROM TB_CLAFISEXC EXC
      INNER JOIN TB_PRODUTOS PRO ON PRO.FK_CLAFIS = EXC.FK_CLAFIS
      WHERE PRO.PK_ID = '${produto}' AND EXC.FK_ESTADO = '${uf}';

      -- 9. EXCEÇÃO ICMS POR CLIENTE
      SELECT TOP 1
        CADEXC.PK_ID, CADEXC.CD_SITTRIBUTARIA, CADEXC.VL_PORREDUICMS, CADEXC.VL_PORICMS,
        CADEXC.FK_MOTIVODESONICMS, CADEXC.CD_BENEFIS, CADEXC.FK_INFCOMPL
      FROM TB_EXCECAOICMS CADEXC
      WHERE CADEXC.FK_CADUNICO = ${cliente}
        AND (CADEXC.FK_PRODUTO = '${produto}' OR CADEXC.FK_PRODUTO = '' OR CADEXC.FK_PRODUTO IS NULL);

      -- 10. REGRAS DE IMPOSTO GERAIS (TB_REGRAIMPOSTO)
      SELECT
        REG.PK_ID, REG.TG_IMPOSTO, REG.CD_SITRIBUTARIA, REG.VL_PORIMPOSTO, REG.VL_PORREDUCAO,
        REG.VL_ALIQBASE, REG.TG_DEDUZIR, REG.NR_CEST, REG.CD_BENEFIS, REG.FK_INFCOMPL,
        REG.VL_PORICMFCP, REG.FK_MOTIVODESONICMS, REG.FK_CALCDIFAL
      FROM TB_REGRAIMPOSTO REG
      WHERE REG.TG_INATIVO = 0
        AND (REG.FK_CFOP = ${cfop} OR REG.FK_CFOP = 0 OR REG.FK_CFOP IS NULL)
        AND (REG.FK_ESTADO = '${uf}' OR REG.FK_ESTADO = '' OR REG.FK_ESTADO IS NULL);

      -- 11. SUBSTITUIÇÃO TRIBUTÁRIA (TB_SUBSTRIBUTARIA)
      SELECT TOP 1
        ST.PK_ID, ST.CD_SITTRIBUTARIA, ST.VL_BASEARBITRADA, ST.VL_ALIQBASE, ST.VL_PORCSUBS,
        ST.VL_PORREDUICMS, ST.VL_PORICMFCP, ST.TG_DEDUZIR, ST.NR_CEST, ST.FK_INFCOMPL
      FROM TB_SUBSTRIBUTARIA ST
      INNER JOIN TB_PRODUTOS PRO ON PRO.FK_CLAFIS = ST.FK_CLAFIS
      WHERE PRO.PK_ID = '${produto}' AND ST.FK_ESTADO = '${uf}';

      -- 12. PARÂMETROS DO SISTEMA (TS_PARAMETROS)
      SELECT DS_PARAMETRO, DS_CONTEUDO
      FROM TS_PARAMETROS;
    `;
  }

  /**
   * Gera dados simulados realistas para teste sem banco conectado (Modo Demonstração)
   */
  public static getMockSimulationPayload(item: ItemFiscalInput, cabecalho: CabecalhoFiscalInput): SimulationPayload {
    const cfop = item.fkCfop || 5102;
    const isVendaDentro = [5101, 5102, 5405].includes(cfop);
    const isSt = [5405, 5403, 6403].includes(cfop);

    return {
      item: {
        fkProduto: item.fkProduto || '001',
        fkCfop: cfop,
        qtMovimento: item.qtMovimento || 1,
        vlUnitario: item.vlUnitario || 100,
        vlTotal: item.vlTotal || (item.qtMovimento || 1) * (item.vlUnitario || 100),
        vlFrete: item.vlFrete || 0,
        vlSeguro: item.vlSeguro || 0,
        vlDespesas: item.vlDespesas || 0,
        vlDesconto: item.vlDesconto || 0
      },
      cabecalho: {
        tipo: cabecalho.tipo || 'S',
        fkEmpresa: cabecalho.fkEmpresa || '01',
        fkCadunico: cabecalho.fkCadunico || 1001,
        dsUf: cabecalho.dsUf || 'SP',
        tgRegime: cabecalho.tgRegime || 1,
        tgOperacao: isVendaDentro ? 1 : 2
      },
      cursors: {
        tmpCalCfo: {
          PK_ID: cfop,
          NR_SITTRIBICMS: isSt ? '60' : '00',
          NR_SITTRIBICMSSN: isSt ? '500' : '102',
          NR_SITTRIBIPI: '53',
          NR_SITTRIBPIS: '01',
          NR_SITTRIBCOFINS: '01',
          TG_IPI: 1,
          TG_PIS: 1,
          TG_COFINS: 1,
          TG_NAOCALCSUBSICMS: isSt ? 0 : 1
        },
        tmpCalPro: {
          PK_ID: item.fkProduto || '001',
          DS_PRODUTO: 'PRODUTO SIMULADO FISCAL TESTE',
          TG_ORIGEMICMS: '0',
          CD_SITTRIBUTARIA: isSt ? '60' : '00',
          NR_SITTRIBIPI: '53',
          VL_PORIPI: 5,
          NR_SITTRIBPIS: '01',
          VL_PORPIS: 1.65,
          NR_SITTRIBCOFINS: '01',
          VL_PORCOFINS: 7.60
        },
        tmpCalEmp: {
          PK_ID: '01',
          DS_EMPRESA: 'EMPRESA SIMULADA MATRIZ LTDA',
          DS_UF: 'SP',
          TG_REGIME: cabecalho.tgRegime || 1,
          TG_CRT: (cabecalho.tgRegime || 1) === 2 ? 1 : 3,
          TG_CONTRIBUINTEICMS: 1
        },
        tmpCalCad: {
          PK_ID: cabecalho.fkCadunico || 1001,
          DS_NOME: 'CLIENTE CONSUMIDOR FINAL S/A',
          TG_PESSOA: 'J',
          TG_CONTRIBUINTEICMS: 1,
          DS_UF: cabecalho.dsUf || 'SP'
        },
        tmpCalIcm: {
          VL_PORICM: isVendaDentro ? 18 : 12,
          VL_PORICMCONS: 18
        },
        tmpCalCf: {
          PK_ID: 1,
          CD_CLAFIS: '8471.30.12',
          VL_PORIPI: 5,
          VL_PORPIS: 1.65,
          VL_PORCOFINS: 7.60,
          NR_CEST: isSt ? '21.001.00' : ''
        },
        tmpCalIcmSt: isSt ? {
          PK_ID: 1,
          CD_SITTRIBUTARIA: '10',
          VL_ALIQBASE: 40, // MVA 40%
          VL_PORCSUBS: 18,
          VL_PORREDUICMS: 0,
          TG_DEDUZIR: 1,
          NR_CEST: '21.001.00'
        } : {},
        tmpDest: {
          TG_CALCICMSST: isSt ? 1 : 0
        },
        tsParametros: {
          'FATURAMENTO.PISCOFINSSEMICMS': 1,
          'FATURAMENTO.PISCOFINSCOMFRETE': 1,
          'VENDAS.IPICOMFRETE': 1
        }
      }
    };
  }
}
