import type { IncomingMessage, ServerResponse } from 'http';
import sql from 'mssql';

interface SqlRequestConfig {
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

// Cache do pool de conexões para evitar reconexões desnecessárias
let currentPool: sql.ConnectionPool | null = null;
let currentConfigKey = '';

function getConfigKey(cfg: SqlRequestConfig): string {
  return `${cfg.server}:${cfg.port || 1433}:${cfg.database}:${cfg.user || ''}:${cfg.instanceName || ''}`;
}

async function getPool(cfg: SqlRequestConfig): Promise<sql.ConnectionPool> {
  const key = getConfigKey(cfg);
  if (currentPool && currentConfigKey === key && currentPool.connected) {
    return currentPool;
  }

  if (currentPool) {
    try {
      await currentPool.close();
    } catch {}
    currentPool = null;
  }

  // Tratamento especial para formato SERVIDOR\INSTANCIA (ex: SBD\SQL2022)
  let serverHost = cfg.server.trim();
  let instance = cfg.instanceName?.trim() || undefined;
  let port: number | undefined = cfg.port ? Number(cfg.port) : 1433;

  if (serverHost.includes('\\')) {
    const parts = serverHost.split('\\');
    serverHost = parts[0];
    if (!instance && parts[1]) {
      instance = parts[1];
    }
  }

  const sqlConfig: sql.config = {
    server: serverHost,
    port: instance ? undefined : port, // No Tedious, port e instanceName não devem ser passados juntos
    database: cfg.database.trim(),
    user: cfg.user?.trim() || '',
    password: cfg.password || '',
    options: {
      encrypt: cfg.encrypt ?? false,
      trustServerCertificate: cfg.trustServerCertificate ?? true,
      instanceName: instance,
    },
    connectionTimeout: cfg.connectTimeout || 10000,
    requestTimeout: 30000,
  };

  currentPool = await new sql.ConnectionPool(sqlConfig).connect();
  currentConfigKey = key;
  return currentPool;
}

function parseJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch {
        reject(new Error('JSON inválido na requisição'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function safeQuery(pool: sql.ConnectionPool, queryText: string): Promise<sql.IRecordSet<any> | null> {
  try {
    const result = await pool.request().query(queryText);
    return result.recordset;
  } catch (err: any) {
    console.warn('[SQL SafeQuery Notice]:', err?.message || err);
    return null;
  }
}

export async function handleSqlApi(req: IncomingMessage, res: ServerResponse, subPath: string) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Método não permitido. Use POST.' });
  }

  try {
    const body = await parseJsonBody(req);
    const config: SqlRequestConfig = body.config;

    if (!config || !config.server || !config.database) {
      return sendJson(res, 400, { success: false, error: 'Configuração do SQL Server incompleta (servidor e banco são obrigatórios).' });
    }

    if (subPath === '/test-connection') {
      const pool = await getPool(config);
      const result = await pool.request().query('SELECT @@VERSION AS version, DB_NAME() AS current_db');
      return sendJson(res, 200, {
        success: true,
        message: 'Conexão estabelecida com sucesso!',
        database: result.recordset[0]?.current_db,
        serverVersion: result.recordset[0]?.version
      });
    }

    if (subPath === '/search') {
      const pool = await getPool(config);
      const entity = String(body.entity || '').toLowerCase();
      const term = String(body.term || '').replace(/'/g, '');

      let query = '';
      if (entity === 'produto') {
        query = `
          SELECT TOP 25 PK_ID, DS_PRODUTO, DS_NOME, FK_CLAFIS, COALESCE(NR_SITTRIB, '') AS CD_SITTRIBUTARIA
          FROM TB_PRODUTOS
          WHERE PK_ID LIKE '%${term}%' OR DS_PRODUTO LIKE '%${term}%' OR DS_NOME LIKE '%${term}%'
          ORDER BY CASE WHEN PK_ID = '${term}' OR CAST(PK_ID AS VARCHAR) = '${term}' THEN 0 ELSE 1 END, PK_ID
        `;
      } else if (entity === 'cfop') {
        query = `
          SELECT TOP 25 PK_ID, NR_SITTRIBICMS, TG_TIPO
          FROM TB_CFOP
          WHERE CAST(PK_ID AS VARCHAR) LIKE '%${term}%'
          ORDER BY CASE WHEN CAST(PK_ID AS VARCHAR) = '${term}' THEN 0 ELSE 1 END, PK_ID
        `;
      } else if (entity === 'cliente') {
        query = `
          SELECT TOP 25 PK_ID, DS_NOME, DS_UF, TG_CONTRIBUINTEICMS, TG_PESSOA
          FROM TB_CADUNICO
          WHERE CAST(PK_ID AS VARCHAR) LIKE '%${term}%' OR DS_NOME LIKE '%${term}%'
          ORDER BY CASE WHEN CAST(PK_ID AS VARCHAR) = '${term}' THEN 0 ELSE 1 END, PK_ID
        `;
      } else if (entity === 'empresa') {
        query = `
          SELECT PK_ID, DS_EMPRESA, DS_FANTASIA, DS_UF, TG_REGIMETRIBUTARIO AS TG_REGIME
          FROM TB_EMPRESAS
          ORDER BY PK_ID
        `;
      } else {
        return sendJson(res, 400, { success: false, error: `Entidade de busca desconhecida: ${entity}` });
      }

      const result = await safeQuery(pool, query);
      return sendJson(res, 200, { success: true, rows: result || [] });
    }

    if (subPath === '/load-simulation-data') {
      const pool = await getPool(config);
      const { cfop, produto, empresa, cliente, uf } = body.params || {};

      const safeCfop = Number(cfop || 5102);
      const safeProd = String(produto || '').replace(/'/g, '').trim();
      const safeEmp = String(empresa || '').replace(/'/g, '').trim();
      const safeCli = Number(cliente || 0);
      const safeUf = String(uf || 'SP').replace(/'/g, '').toUpperCase().trim();

      // 1. CFOP (Busca estrita)
      let qCfo = await safeQuery(pool, `
        SELECT TOP 1
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
        WHERE CFO.PK_ID = ${safeCfop}
      `);

      if (!qCfo || qCfo.length === 0) {
        qCfo = await safeQuery(pool, `SELECT TOP 1 * FROM TB_CFOP WHERE PK_ID = ${safeCfop}`);
      }

      if (!qCfo || qCfo.length === 0) {
        return sendJson(res, 404, {
          success: false,
          error: `O CFOP "${safeCfop}" NÃO foi encontrado na tabela TB_CFOP do banco [${config.database}]. Por favor, verifique o CFOP informado.`
        });
      }

      // 2. PRODUTO (Busca ESTRITA pelo PK_ID exato digitado pelo usuário)
      let qProd = await safeQuery(pool, `
        SELECT TOP 1
          PRO.PK_ID, PRO.DS_PRODUTO, PRO.DS_NOME, PRO.FK_CLAFIS,
          COALESCE(PRO.NR_SITTRIB, '') AS NR_SITTRIB,
          COALESCE(PRO.TG_ORIGEMICMS, 0) AS TG_ORIGEMICMS,
          PRO.NR_SITTRIBIPI, PRO.VL_PORIPI, PRO.NR_SITTRIBPIS, PRO.VL_PORPIS,
          PRO.NR_SITTRIBCOFINS, PRO.VL_PORCOFINS, PRO.TG_ISENTOICMS,
          PRO.VL_PRETAB1, PRO.VL_PRETAB2
        FROM TB_PRODUTOS PRO
        WHERE PRO.PK_ID = '${safeProd}' OR CAST(PRO.PK_ID AS VARCHAR) = '${safeProd}'
      `);

      if (qProd === null) {
        qProd = await safeQuery(pool, `
          SELECT TOP 1 *
          FROM TB_PRODUTOS
          WHERE PK_ID = '${safeProd}' OR CAST(PK_ID AS VARCHAR) = '${safeProd}'
        `);
      }

      if (!qProd || qProd.length === 0) {
        return sendJson(res, 404, {
          success: false,
          error: `O produto "${safeProd}" NÃO foi encontrado na tabela TB_PRODUTOS do banco [${config.database}]. Por favor, verifique o código informado ou utilize a busca no banco.`
        });
      }

      const prodRecord: Record<string, any> = { ...qProd[0] };
      prodRecord.CD_SITTRIBUTARIA = prodRecord.CD_SITTRIBUTARIA || prodRecord.NR_SITTRIB || prodRecord.CD_SITTRIBUTARIASN || '00';
      const prodPk = String(prodRecord.PK_ID).replace(/'/g, '');
      const fkClafis = prodRecord.FK_CLAFIS ? String(prodRecord.FK_CLAFIS).replace(/'/g, '').trim() : '';

      // 3. EMPRESA (Busca estrita)
      let qEmp = await safeQuery(pool, `
        SELECT TOP 1
          EMP.PK_ID, EMP.DS_FANTASIA, EMP.DS_EMPRESA, EMP.DS_UF,
          COALESCE(EMP.TG_REGIMETRIBUTARIO, 1) AS TG_REGIMETRIBUTARIO,
          EMP.TG_CONTRIBUINTEICMS, EMP.TG_ISENTOICMS, EMP.TG_ISENTOIPI, EMP.TG_ISENTOPIS, EMP.TG_ISENTOCOFINS,
          EMP.NR_SITTRIBICMS, EMP.VL_ALIQSSICMS
        FROM TB_EMPRESAS EMP
        WHERE EMP.PK_ID = '${safeEmp}' OR CAST(EMP.PK_ID AS VARCHAR) = '${safeEmp}'
      `);

      if (!qEmp || qEmp.length === 0) {
        qEmp = await safeQuery(pool, `SELECT TOP 1 * FROM TB_EMPRESAS WHERE PK_ID = '${safeEmp}' OR CAST(PK_ID AS VARCHAR) = '${safeEmp}'`);
      }

      if (!qEmp || qEmp.length === 0) {
        return sendJson(res, 404, {
          success: false,
          error: `A empresa "${safeEmp}" NÃO foi encontrada na tabela TB_EMPRESAS do banco [${config.database}]. Por favor, verifique o código da empresa.`
        });
      }

      const empRecord: Record<string, any> = qEmp?.[0] ? { ...qEmp[0] } : {};
      empRecord.TG_REGIME = empRecord.TG_REGIME || (empRecord.TG_REGIMETRIBUTARIO === 1 || empRecord.TG_REGIMETRIBUTARIO === 2 ? 2 : 1);
      empRecord.TG_CRT = empRecord.TG_REGIMETRIBUTARIO || 1;
      const empUf = String(empRecord.DS_UF || 'SP').replace(/'/g, '').trim().toUpperCase();

      // 4. CLIENTE (Validação estrita pelo ID digitado)
      let qCad = await safeQuery(pool, `
        SELECT TOP 1
          CAD.PK_ID, CAD.DS_NOME, CAD.TG_PESSOA, CAD.TG_CONTRIBUINTEICMS, CAD.DS_UF,
          CAD.FK_REGIMETRIBUTARIO, CAD.TG_ISENTOIPI, CAD.TG_ISENTOPIS, CAD.TG_ISENTOCOFINS
        FROM TB_CADUNICO CAD
        WHERE CAD.PK_ID = ${safeCli}
      `);

      if (!qCad || qCad.length === 0) {
        qCad = await safeQuery(pool, `SELECT TOP 1 * FROM TB_CADUNICO WHERE PK_ID = ${safeCli}`);
      }

      if (!qCad || qCad.length === 0) {
        return sendJson(res, 404, {
          success: false,
          error: `O cliente/destinatário com ID "${safeCli}" NÃO foi encontrado na tabela TB_CADUNICO do banco [${config.database}]. Por favor, verifique o código informado ou utilize a busca no banco.`
        });
      }

      const cadRecord: Record<string, any> = qCad?.[0] ? { ...qCad[0] } : {};
      const destUf = String(cadRecord.DS_UF || safeUf).replace(/'/g, '').trim().toUpperCase();

      // 5. ALÍQUOTA ESTADO (TB_ICMS: FK_UFORIGEM e FK_UFDESTINO conforme NFE_CALCULARITEM.PRG)
      let qIcm = await safeQuery(pool, `
        SELECT TOP 1 ICM.VL_PORICMCONS, ICM.VL_PORICM
        FROM TB_ICMS ICM
        WHERE ICM.FK_UFORIGEM = '${empUf}' AND ICM.FK_UFDESTINO = '${destUf}'
      `);

      if (!qIcm || qIcm.length === 0) {
        qIcm = await safeQuery(pool, `
          SELECT TOP 1 ICM.VL_PORICMCONS, ICM.VL_PORICM
          FROM TB_ICMS ICM
          WHERE ICM.FK_UFDESTINO = '${destUf}' OR ICM.FK_UFORIGEM = '${empUf}'
        `);
      }

      // 6. CLASSIFICAÇÃO FISCAL NCM (TB_CLAFIS)
      let qCf = fkClafis ? await safeQuery(pool, `
        SELECT TOP 1
          CLA.PK_ID, CLA.CD_CLAFIS, CLA.NR_SITTRIBIPISAI, CLA.NR_SITTRIBIPIENT, CLA.VL_PORIPI,
          CLA.NR_SITTRIBPIS, CLA.VL_PORPIS, CLA.NR_SITTRIBCOFINS, CLA.VL_PORCOFINS, CLA.NR_CEST
        FROM TB_CLAFIS CLA
        WHERE CLA.PK_ID = '${fkClafis}'
      `) : null;

      if (!qCf || qCf.length === 0) {
        qCf = await safeQuery(pool, `
          SELECT TOP 1
            CLA.PK_ID, CLA.CD_CLAFIS, CLA.NR_SITTRIBIPISAI, CLA.NR_SITTRIBIPIENT, CLA.VL_PORIPI,
            CLA.NR_SITTRIBPIS, CLA.VL_PORPIS, CLA.NR_SITTRIBCOFINS, CLA.VL_PORCOFINS, CLA.NR_CEST
          FROM TB_CLAFIS CLA
          INNER JOIN TB_PRODUTOS PRO ON PRO.FK_CLAFIS = CLA.PK_ID
          WHERE PRO.PK_ID = '${prodPk}'
        `);
      }

      // 7. EXCEÇÃO NCM/UF (TB_CLAFISEXC: FK_ORIGEM = FK_CLAFIS)
      let qCfEx = fkClafis ? await safeQuery(pool, `
        SELECT TOP 1
          CLE.CD_SITTRIBUTARIA, CLE.VL_PORREDUICMS, CLE.VL_PORICMS, CLE.FK_INFCOMPL,
          CLE.TG_CONTRIBUINTE, CLE.CD_BENEFIS, CLE.NR_CEST
        FROM TB_CLAFISEXC CLE
        WHERE CLE.FK_ORIGEM = '${fkClafis}'
          AND (CLE.FK_UFDESTINO = '${destUf}' OR CLE.FK_UFDESTINO = '' OR CLE.FK_UFDESTINO IS NULL)
          AND (CLE.FK_UFORIGEM = '${empUf}' OR CLE.FK_UFORIGEM = '' OR CLE.FK_UFORIGEM IS NULL)
        ORDER BY CLE.FK_UFDESTINO DESC, CLE.FK_UFORIGEM DESC
      `) : null;

      // 8. EXCEÇÃO CLIENTE (TB_EXCECAOICMS)
      let qCfExCad = await safeQuery(pool, `
        SELECT TOP 1
          CADEXC.CD_SITTRIBUTARIA, CADEXC.VL_PORREDUICMS, CADEXC.VL_PORICMS,
          CADEXC.FK_MOTIVODESONICMS, CADEXC.CD_BENEFIS, CADEXC.FK_INFCOMPL, CADEXC.NR_CEST
        FROM TB_EXCECAOICMS CADEXC
        WHERE CADEXC.FK_CADUNICO = ${safeCli}
          AND (CADEXC.FK_CLAFIS = '${fkClafis}' OR CADEXC.FK_CLAFIS = '' OR CADEXC.FK_CLAFIS IS NULL)
        ORDER BY CADEXC.FK_CLAFIS DESC
      `);

      // 9. REGRAS GERAIS DE IMPOSTO (TB_REGRAIMPOSTO)
      const qRegras = await safeQuery(pool, `
        SELECT
          REG.PK_ID, REG.TG_IMPOSTO, REG.CD_SITRIBUTARIA, REG.VL_PORIMPOSTO, REG.VL_PORREDUCAO,
          REG.VL_ALIQBASE, REG.TG_DEDUZIR, REG.NR_CEST, REG.CD_BENEFIS, REG.FK_INFCOMPL,
          REG.VL_PORICMFCP, REG.FK_MOTIVODESONICMS, REG.FK_CALCDIFAL
        FROM TB_REGRAIMPOSTO REG
        WHERE REG.TG_INATIVO = 0
          AND (REG.FK_CFOP = ${safeCfop} OR REG.FK_CFOP = 0 OR REG.FK_CFOP IS NULL)
          AND (REG.FK_ESTADO = '${destUf}' OR REG.FK_ESTADO = '' OR REG.FK_ESTADO IS NULL)
      `);

      // 10. SUBSTITUIÇÃO TRIBUTÁRIA (TB_SUBSTRIBUTARIA)
      let qSt = fkClafis ? await safeQuery(pool, `
        SELECT TOP 1
          ST.CD_SITTRIBUTARIA, ST.FK_INFCOMPL, ST.VL_BASEARBITRADA, ST.VL_ALIQBASE, ST.VL_PORCSUBS,
          ST.TG_CALCSUBSEMICM, ST.TG_DEDUZIR, ST.VL_PORREDUICMS, ST.VL_PORICMFCP, ST.NR_CEST
        FROM TB_SUBSTRIBUTARIA ST
        WHERE ST.FK_CLAFIS = '${fkClafis}'
          AND (ST.FK_ESTADO = '${destUf}' OR ST.FK_ESTADO = '' OR ST.FK_ESTADO IS NULL)
          AND (ST.FK_UFORIGEM = '${empUf}' OR ST.FK_UFORIGEM = '' OR ST.FK_UFORIGEM IS NULL)
        ORDER BY ST.FK_ESTADO DESC, ST.FK_UFORIGEM DESC
      `) : null;

      // 11. PARÂMETROS DO SISTEMA (TS_PARAMETROS)
      let parametrosObj: Record<string, any> = {};
      const qParam = await safeQuery(pool, `SELECT DS_PARAMETRO, DS_CONTEUDO FROM TS_PARAMETROS`);
      if (qParam) {
        for (const row of qParam) {
          if (row.DS_PARAMETRO) {
            parametrosObj[String(row.DS_PARAMETRO).trim()] = row.DS_CONTEUDO;
          }
        }
      }

      // 12. TABELA DE SITUAÇÃO TRIBUTÁRIA (TB_SITTRIBUTARIA - L2923 e L3194 do NFE_CALCULARITEM.PRG)
      const qSitTrib = await safeQuery(pool, `
        SELECT PK_ID, TG_ICMS, COALESCE(FK_INFCOMPLICMS, 0) AS FK_INFCOMPLICMS
        FROM TB_SITTRIBUTARIA
      `);

      // 13. DESTINO DA MERCADORIA (TB_DESTINOMERCADORIA - L2070 do NFE_CALCULARITEM.PRG)
      const safeDestMer = Number(body.params?.destMer || 1);
      const qDest = await safeQuery(pool, `
        SELECT TOP 1
          COALESCE(DEST.TG_CALCICMSST, 0) AS TG_CALCICMSST,
          COALESCE(DEST.TG_IPISOMABCICMS, 0) AS TG_IPISOMABCICMS
        FROM TB_DESTINOMERCADORIA AS DEST
        WHERE DEST.PK_ID = ${safeDestMer}
      `);

      const allRegras = qRegras || [];

      return sendJson(res, 200, {
        success: true,
        database: config.database,
        diagnostics: {
          productFound: !!(qProd && qProd.length > 0),
          productId: prodRecord.PK_ID || safeProd,
          productName: prodRecord.DS_PRODUTO || prodRecord.DS_NOME || '',
          companyFound: !!(qEmp && qEmp.length > 0),
          customerFound: !!(qCad && qCad.length > 0),
          cfopFound: !!(qCfo && qCfo.length > 0),
          ncmFound: !!(qCf && qCf.length > 0),
          ncmExceptionFound: !!(qCfEx && qCfEx.length > 0)
        },
        cursors: {
          tmpCalCfo: qCfo?.[0] || {},
          tmpCalPro: prodRecord,
          tmpCalEmp: empRecord,
          tmpCalCad: cadRecord,
          tmpCalIcm: qIcm?.[0] || {},
          tmpCalCf: qCf?.[0] || {},
          tmpCalCfEx: qCfEx?.[0] || {},
          tmpCalCfExCad: qCfExCad?.[0] || {},
          tmpCalIcmSt: qSt?.[0] || {},
          tmpRegraImpIcm: allRegras.filter(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'ICMS' || String(r.TG_IMPOSTO).trim().toUpperCase() === 'ICMSST'),
          tmpRegraImpIpi: allRegras.filter(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'IPI'),
          tmpRegraImpPis: allRegras.filter(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'PIS'),
          tmpRegraImpCofins: allRegras.filter(r => String(r.TG_IMPOSTO).trim().toUpperCase() === 'COFINS'),
          tmpSitTributariaIcms: qSitTrib || [],
          tmpDest: qDest?.[0] || {
            TG_CALCICMSST: 1,
            TG_IPISOMABCICMS: safeDestMer === 2 ? 1 : 0
          },
          tsParametros: parametrosObj
        }
      });
    }

    if (subPath === '/query') {
      const pool = await getPool(config);
      const sqlText = String(body.query || '');
      const result = await pool.request().query(sqlText);
      return sendJson(res, 200, { success: true, rows: result.recordset });
    }

    return sendJson(res, 404, { success: false, error: `Endpoint SQL desconhecido: ${subPath}` });
  } catch (err: any) {
    console.error('[SQL API Error]:', err);
    return sendJson(res, 500, { success: false, error: err?.message || 'Erro de execução no SQL Server' });
  }
}
