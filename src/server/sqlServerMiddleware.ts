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

let lastSqlError: string | null = null;

async function safeQuery(pool: sql.ConnectionPool, queryStr: string): Promise<any[] | null> {
  try {
    lastSqlError = null;
    const result = await pool.request().query(queryStr);
    const rows = result.recordset || [];
    // Normaliza todas as colunas para UPPERCASE para evitar problemas de case-sensitivity (ex: Vl_porpis vs VL_PORPIS)
    // Isso é essencial porque o FoxPro é case-insensitive, mas o JavaScript não.
    return rows.map(row => {
      const upperRow: any = {};
      for (const key in row) {
        upperRow[key.toUpperCase()] = row[key];
      }
      return upperRow;
    });
  } catch (err: any) {
    lastSqlError = err?.message || String(err);
    console.warn('[SQL SafeQuery Notice]:', lastSqlError);
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
          DECLARE @colModelo INT = (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('TB_PRODUTOS') AND name = 'DS_MODELO');
          DECLARE @colNome INT = (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('TB_PRODUTOS') AND name = 'DS_NOME');
          DECLARE @colProduto INT = (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('TB_PRODUTOS') AND name = 'DS_PRODUTO');

          DECLARE @sql NVARCHAR(MAX) = 'SELECT TOP 25 * FROM TB_PRODUTOS WHERE CAST(PK_ID AS VARCHAR) LIKE ''%${term}%'' ';
          
          IF @colModelo > 0 SET @sql = @sql + ' OR DS_MODELO LIKE ''%${term}%'' ';
          IF @colNome > 0 SET @sql = @sql + ' OR DS_NOME LIKE ''%${term}%'' ';
          IF @colProduto > 0 SET @sql = @sql + ' OR DS_PRODUTO LIKE ''%${term}%'' ';
          
          SET @sql = @sql + ' ORDER BY CASE WHEN CAST(PK_ID AS VARCHAR) = ''${term}'' THEN 0 ELSE 1 END, PK_ID';
          
          EXEC sp_executesql @sql;
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
          DECLARE @colNome INT = (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('TB_CADUNICO') AND name = 'DS_NOME');
          DECLARE @colRazao INT = (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('TB_CADUNICO') AND name = 'DS_RAZAO');
          DECLARE @colFantasia INT = (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('TB_CADUNICO') AND name = 'DS_FANTASIA');

          DECLARE @sql NVARCHAR(MAX) = 'SELECT TOP 25 * FROM TB_CADUNICO WHERE CAST(PK_ID AS VARCHAR) LIKE ''%${term}%'' ';
          
          IF @colNome > 0 SET @sql = @sql + ' OR DS_NOME LIKE ''%${term}%'' ';
          IF @colRazao > 0 SET @sql = @sql + ' OR DS_RAZAO LIKE ''%${term}%'' ';
          IF @colFantasia > 0 SET @sql = @sql + ' OR DS_FANTASIA LIKE ''%${term}%'' ';
          
          SET @sql = @sql + ' ORDER BY CASE WHEN CAST(PK_ID AS VARCHAR) = ''${term}'' THEN 0 ELSE 1 END, PK_ID';
          
          EXEC sp_executesql @sql;
        `;
      } else if (entity === 'empresa') {
        query = `
          SELECT PK_ID, COALESCE(DS_NOME, '') AS DS_EMPRESA, COALESCE(DS_NOME, '') AS DS_NOME, DS_FANTASIA, DS_UF, TG_REGIMETRIBUTARIO AS TG_REGIME
          FROM TB_EMPRESAS
          ORDER BY PK_ID
        `;
      } else {
        return sendJson(res, 400, { success: false, error: `Entidade de busca desconhecida: ${entity}` });
      }

      const result = await safeQuery(pool, query);

      if (result) {
        result.forEach(r => {
          const keys = Object.keys(r);
          keys.forEach(k => {
            const upperKey = k.toUpperCase();
            if (upperKey !== k) {
              r[upperKey] = r[k];
            }
          });
          if (entity === 'produto') {
            r.PK_ID = String(r.PK_ID || '').trim();
            r.DS_MODELO = String(r.DS_MODELO || '').trim();
            r.DS_PRODUTO = String(r.DS_PRODUTO || r.DS_MODELO || '').trim();
            r.DS_NOME = String(r.DS_NOME || r.DS_MODELO || '').trim();
            r.CD_SITTRIBUTARIA = r.CD_SITTRIBUTARIA || r.NR_SITTRIB || '';
          }
          if (entity === 'empresa') {
            r.PK_ID = String(r.PK_ID || '').trim();
            r.DS_EMPRESA = String(r.DS_EMPRESA || r.DS_NOME || r.DS_FANTASIA || '').trim();
          }
        });
        return sendJson(res, 200, { success: true, rows: result });
      } else {
        return sendJson(res, 500, { success: false, error: 'Database query failed' });
      }
    }

    if (subPath === '/load-simulation-data') {
      const pool = await getPool(config);
      const { cfop, produto, empresa, cliente, uf, tipo, destMer, dtEmissao } = body.params || {};
      const rawCfop = String(cfop ?? '').trim();
      const safeProd = String(produto ?? '').replace(/'/g, '').trim();
      const safeEmp = String(empresa ?? '').replace(/'/g, '').trim();
      const rawCliente = String(cliente ?? '').trim();
      const safeUf = String(uf ?? '').replace(/'/g, '').toUpperCase().trim();
      const safeTipo = String(tipo ?? '').trim().toUpperCase();
      const safeDestMer = Number(String(destMer ?? '').trim());
      const safeDtEmissao = String(dtEmissao ?? '').trim();
      const sqlDataEmissao = safeDtEmissao ? `CAST('${safeDtEmissao}' AS DATE)` : 'CAST(GETDATE() AS DATE)';

      // O ERP recebe esses identificadores já preenchidos no cabeçalho/item.
      // Não substituir ausência por CFOP 5102, UF SP ou cliente 0: isso faria
      // a simulação parecer um cálculo do NFE_CALCULARITEM quando não é.
      if (!/^\d+$/.test(rawCfop) || !safeProd || !safeEmp || !/^\d+$/.test(rawCliente) || !/^[A-Z]{2}$/.test(safeUf) || !['S', 'E'].includes(safeTipo) || !Number.isInteger(safeDestMer) || (safeDtEmissao && !/^\d{4}-\d{2}-\d{2}$/.test(safeDtEmissao))) {
        return sendJson(res, 400, {
          success: false,
          error: 'Informe CFOP, produto, empresa, cliente, UF, tipo (S/E), destino da mercadoria e, se preenchida, data de emissão válida. A data vazia usa DATASERVER() como no PRG.'
        });
      }

      const safeCfop = Number(rawCfop);
      const safeCli = Number(rawCliente);

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
        return sendJson(res, 404, {
          success: false,
          error: `O CFOP "${safeCfop}" NÃO foi encontrado na tabela TB_CFOP do banco [${config.database}]. Por favor, verifique o CFOP informado.`
        });
      }

      // 1.5. Exceções por UF de CFOP (FT_INFCOMPLCFOP)
      let qCfoEx = await safeQuery(pool, `
        SELECT TOP 1
          COALESCE(INF.FK_INFCOMPL,0) AS FK_INFCOMPL,
          COALESCE(INF.NR_SITTRIBICMS,'') AS NR_SITTRIBICMS,
          COALESCE(INF.NR_SITTRIBICMSSN,'') AS NR_SITTRIBICMSSN,
          COALESCE(INF.NR_SITTRIBPIS,'') AS NR_SITTRIBPIS,
          COALESCE(INF.NR_SITTRIBCOFINS,'') AS NR_SITTRIBCOFINS,
          COALESCE(INF.NR_SITTRIBIPI,'') AS NR_SITTRIBIPI,
          COALESCE(INF.FK_ENQUADRAMENTOIPI,'') AS FK_ENQUADRAMENTOIPI,
          COALESCE(INF.FK_MOTIVODESONICMS,0) AS FK_MOTIVODESONICMS,
          COALESCE(INF.CD_BENEFIS, '') AS CD_BENEFIS,
          COALESCE(IPI.TG_IPI,0) AS TG_IPI,
          COALESCE(PIS.TG_PIS,0) AS TG_PIS,
          COALESCE(COFINS.TG_COFINS,0) AS TG_COFINS
        FROM FT_INFCOMPLCFOP AS INF
        LEFT JOIN TB_SITTRIBIPI AS IPI ON IPI.PK_ID = INF.NR_SITTRIBIPI
        LEFT JOIN TB_SITTRIBPIS AS PIS ON PIS.PK_ID = INF.NR_SITTRIBPIS
        LEFT JOIN TB_SITTRIBCOFINS AS COFINS ON COFINS.PK_ID = INF.NR_SITTRIBCOFINS
        WHERE INF.FK_CFOP = ${safeCfop}
          AND INF.FK_UFORIGEM = '${safeUf}'
          AND INF.TG_INATIVO = 0
      `);

      if (qCfoEx && qCfoEx.length > 0) {
        const ex = qCfoEx[0];
        if (ex.NR_SITTRIBICMS && ex.NR_SITTRIBICMS.trim() !== '') qCfo[0].NR_SITTRIBICMS = ex.NR_SITTRIBICMS;
        if (ex.NR_SITTRIBICMSSN && ex.NR_SITTRIBICMSSN.trim() !== '') qCfo[0].NR_SITTRIBICMSSN = ex.NR_SITTRIBICMSSN;
        if (ex.CD_BENEFIS && ex.CD_BENEFIS.trim() !== '') qCfo[0].CD_BENEFIS = ex.CD_BENEFIS;
        if (ex.NR_SITTRIBPIS && ex.NR_SITTRIBPIS.trim() !== '') {
          qCfo[0].NR_SITTRIBPIS = ex.NR_SITTRIBPIS;
          qCfo[0].TG_PIS = ex.TG_PIS;
        }
        if (ex.NR_SITTRIBCOFINS && ex.NR_SITTRIBCOFINS.trim() !== '') {
          qCfo[0].NR_SITTRIBCOFINS = ex.NR_SITTRIBCOFINS;
          qCfo[0].TG_COFINS = ex.TG_COFINS;
        }
        if (ex.NR_SITTRIBIPI && ex.NR_SITTRIBIPI.trim() !== '') {
          qCfo[0].NR_SITTRIBIPI = ex.NR_SITTRIBIPI;
          qCfo[0].TG_IPI = ex.TG_IPI;
        }
        if (ex.FK_ENQUADRAMENTOIPI && ex.FK_ENQUADRAMENTOIPI.trim() !== '') {
          qCfo[0].FK_ENQUADRAMENTOIPI = ex.FK_ENQUADRAMENTOIPI;
        }
      }

      // 2. PRODUTO (Busca por PK_ID exato ou DS_MODELO)
      let qProd = await safeQuery(pool, `
        SELECT TOP 1
          PRO.PK_ID,
          PRO.DS_MODELO,
          PRO.DS_MODELO AS DS_PRODUTO,
          PRO.DS_MODELO AS DS_NOME,
          PRO.FK_CLAFIS,
          PRO.VL_IPIPORQTD,
          PRO.NR_SITTRIB,
          PRO.NR_SITTRIB AS CD_SITTRIBUTARIA,
          PRO.TG_ORIGEMICMS,
          PRO.NR_SITTRIBIPI,
          PRO.FK_ENQUADRAMENTOIPI,
          PRO.NR_SITTRIBPIS,
          PRO.NR_SITTRIBCOFINS,
          PRO.VL_PRETAB1, PRO.VL_PRETAB2, PRO.VL_PRETAB3, PRO.VL_PRETAB4, PRO.VL_PRETAB5, PRO.VL_PRETAB6,
          COALESCE(ORI.TG_ORIGEM, 0) AS TG_ORIGEM,
          COALESCE(PRO.FK_MOTIVODESONICMS, 0) AS FK_MOTIVODESONICMS,
          COALESCE(IPI.TG_IPI, 0) AS TG_IPI,
          COALESCE(PIS.TG_PIS, 0) AS TG_PIS,
          COALESCE(COFINS.TG_COFINS, 0) AS TG_COFINS
        FROM TB_PRODUTOS PRO
        LEFT JOIN TB_ICMSORIGEM ORI ON ORI.PK_ID = PRO.TG_ORIGEMICMS
        LEFT JOIN TB_SITTRIBIPI IPI ON IPI.PK_ID = PRO.NR_SITTRIBIPI
        LEFT JOIN TB_SITTRIBPIS PIS ON PIS.PK_ID = PRO.NR_SITTRIBPIS
        LEFT JOIN TB_SITTRIBCOFINS COFINS ON COFINS.PK_ID = PRO.NR_SITTRIBCOFINS
        WHERE RTRIM(LTRIM(CAST(PRO.PK_ID AS VARCHAR(100)))) = '${safeProd}'
           OR RTRIM(LTRIM(CAST(PRO.DS_MODELO AS VARCHAR(100)))) = '${safeProd}'
        ORDER BY CASE WHEN RTRIM(LTRIM(CAST(PRO.PK_ID AS VARCHAR(100)))) = '${safeProd}' THEN 0 ELSE 1 END
      `);

      if (qProd === null) {
        qProd = await safeQuery(pool, `
          SELECT TOP 1 *,
            PRO.DS_MODELO AS DS_PRODUTO,
            PRO.DS_MODELO AS DS_NOME,
            PRO.NR_SITTRIB AS CD_SITTRIBUTARIA
          FROM TB_PRODUTOS PRO
          WHERE RTRIM(LTRIM(CAST(PRO.PK_ID AS VARCHAR(100)))) = '${safeProd}'
             OR RTRIM(LTRIM(CAST(PRO.DS_MODELO AS VARCHAR(100)))) = '${safeProd}'
          ORDER BY CASE WHEN RTRIM(LTRIM(CAST(PRO.PK_ID AS VARCHAR(100)))) = '${safeProd}' THEN 0 ELSE 1 END
        `);
      }

      if (!qProd || qProd.length === 0) {
        return sendJson(res, 404, {
          success: false,
          error: `O produto "${safeProd}" NÃO foi encontrado na tabela TB_PRODUTOS do banco [${config.database}]. Por favor, verifique o código informado ou utilize a busca no banco.`
        });
      }

      const prodRecord: Record<string, any> = { ...qProd[0] };
      prodRecord.PK_ID = String(prodRecord.PK_ID || '').trim();
      prodRecord.DS_MODELO = String(prodRecord.DS_MODELO || '').trim();
      prodRecord.DS_PRODUTO = String(prodRecord.DS_PRODUTO || prodRecord.DS_MODELO || '').trim();
      prodRecord.DS_NOME = String(prodRecord.DS_NOME || prodRecord.DS_MODELO || '').trim();
      prodRecord.CD_SITTRIBUTARIA = String(prodRecord.CD_SITTRIBUTARIA || prodRecord.NR_SITTRIB || '').trim();
      prodRecord.NR_SITTRIB = prodRecord.CD_SITTRIBUTARIA;
      const prodPk = prodRecord.PK_ID;
      const fkClafis = prodRecord.FK_CLAFIS ? String(prodRecord.FK_CLAFIS).replace(/'/g, '').trim() : '';

      // 3. EMPRESA (Busca estrita)
      let qEmp = await safeQuery(pool, `
        SELECT TOP 1
          EMP.PK_ID, EMP.DS_FANTASIA,
          COALESCE(EMP.DS_NOME, '') AS DS_EMPRESA,
          COALESCE(EMP.DS_NOME, '') AS DS_NOME,
          EMP.DS_UF,
          EMP.TG_ISENTOIPI, EMP.FK_INFCOMPLIPI, EMP.NR_SITTRIBIPI, EMP.FK_ENQUADRAMENTOIPI,
          EMP.TG_ISENTOICMS, EMP.FK_INFCOMPLICMS, EMP.NR_SITTRIBICMS,
          EMP.TG_ISENTOCOFINS, EMP.NR_SITTRIBCOFINS, EMP.FK_INFCOMPLCOFINS,
          EMP.TG_ISENTOPIS, EMP.NR_SITTRIBPIS, EMP.FK_INFCOMPLPIS,
          EMP.VL_ALIQSSICMS, EMP.TG_REGIMETRIBUTARIO, EMP.TG_CONTRIBUINTEICMS,
          COALESCE(EMP.FK_MOTIVODESONICMS, 0) AS FK_MOTIVODESONICMS,
          COALESCE(IPI.TG_IPI, 0) AS TG_IPI,
          COALESCE(PIS.TG_PIS, 0) AS TG_PIS,
          COALESCE(COFINS.TG_COFINS, 0) AS TG_COFINS
        FROM TB_EMPRESAS EMP
        LEFT JOIN TB_SITTRIBIPI IPI ON IPI.PK_ID = EMP.NR_SITTRIBIPI
        LEFT JOIN TB_SITTRIBPIS PIS ON PIS.PK_ID = EMP.NR_SITTRIBPIS
        LEFT JOIN TB_SITTRIBCOFINS COFINS ON COFINS.PK_ID = EMP.NR_SITTRIBCOFINS
        WHERE RTRIM(LTRIM(CAST(EMP.PK_ID AS VARCHAR(50)))) = '${safeEmp}'
           OR (ISNUMERIC(EMP.PK_ID) = 1 AND CAST(EMP.PK_ID AS INT) = ${Number(safeEmp) || -999999})
      `);

      if (qEmp === null) {
        qEmp = await safeQuery(pool, `
          SELECT TOP 1 *,
            COALESCE(DS_NOME, '') AS DS_EMPRESA
          FROM TB_EMPRESAS EMP
          WHERE RTRIM(LTRIM(CAST(EMP.PK_ID AS VARCHAR(50)))) = '${safeEmp}'
             OR (ISNUMERIC(EMP.PK_ID) = 1 AND CAST(EMP.PK_ID AS INT) = ${Number(safeEmp) || -999999})
        `);
      }

      if (!qEmp || qEmp.length === 0) {
        return sendJson(res, 404, {
          success: false,
          error: `A empresa "${safeEmp}" NÃO foi encontrada na tabela TB_EMPRESAS do banco [${config.database}]. Por favor, verifique o código da empresa.`
        });
      }

      const empRecord: Record<string, any> = qEmp?.[0] ? { ...qEmp[0] } : {};
      const empUf = String(empRecord.DS_UF ?? '').replace(/'/g, '').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(empUf)) {
        return sendJson(res, 422, { success: false, error: `A empresa "${safeEmp}" não possui DS_UF válida. A simulação não inferiu uma UF.` });
      }

      // 4. CLIENTE (Validação estrita pelo ID digitado)
      let qCad = await safeQuery(pool, `
        SELECT TOP 1
          CAD.PK_ID, CAD.FK_INFCOMPLIPIINCT, CAD.TG_IPI, CAD.FK_INFCOMPLIPI,
          COALESCE(CAD.NR_SITTRIBIPI, ' ') AS NR_SITTRIBIPI,
          COALESCE(CAD.FK_ENQUADRAMENTOIPI, ' ') AS FK_ENQUADRAMENTOIPI,
          CAD.FK_INFCOMPLICMSINCT, CAD.TG_ICMS, CAD.FK_INFCOMPLICMS,
          COALESCE(CAD.NR_SITTRIBICMS, ' ') AS NR_SITTRIBICMS,
          CAD.FK_INFCOMPLPISINCT, CAD.TG_PIS, CAD.FK_INFCOMPLPIS,
          COALESCE(CAD.NR_SITTRIBPIS, ' ') AS NR_SITTRIBPIS,
          CAD.FK_INFCOMPLCOFINSINCT, CAD.TG_COFINS, CAD.FK_INFCOMPLCOFINS,
          COALESCE(CAD.NR_SITTRIBCOFINS, ' ') AS NR_SITTRIBCOFINS,
          CAD.TG_PESSOA, CAD.FK_REGIMETRIBUTARIO, CAD.TG_CONTRIBUINTEICMS,
          COALESCE(CAD.FK_MOTIVODESONICMS, 0) AS FK_MOTIVODESONICMS,
          COALESCE(IPI.TG_IPI, 0) AS TG_IPITRIB,
          COALESCE(PIS.TG_PIS, 0) AS TG_PISTRIB,
          COALESCE(COFINS.TG_COFINS, 0) AS TG_COFINSTRIB,
          PLUS.CD_BENEFIS,
          COALESCE(CAD.DS_RAZAO, CAD.DS_FANTASIA, '') AS DS_NOME,
          COALESCE(CAD.DS_RAZAO, CAD.DS_FANTASIA, '') AS DS_RAZAO,
          CAD.DS_FANTASIA, CAD.DS_UF
        FROM TB_CADUNICO CAD
        LEFT JOIN TB_SITTRIBIPI IPI ON IPI.PK_ID = CAD.NR_SITTRIBIPI
        LEFT JOIN TB_SITTRIBPIS PIS ON PIS.PK_ID = CAD.NR_SITTRIBPIS
        LEFT JOIN TB_SITTRIBCOFINS COFINS ON COFINS.PK_ID = CAD.NR_SITTRIBCOFINS
        LEFT JOIN TB_CADUNICOPLUS PLUS ON PLUS.PK_ID = CAD.PK_ID
        WHERE CAD.PK_ID = ${safeCli}
      `);

      if (qCad === null) {
        qCad = await safeQuery(pool, `
          SELECT TOP 1 *,
            COALESCE(DS_RAZAO, DS_FANTASIA, '') AS DS_NOME
          FROM TB_CADUNICO CAD
          WHERE CAD.PK_ID = ${safeCli}
        `);
      }

      if (!qCad || qCad.length === 0) {
        return sendJson(res, 404, {
          success: false,
          error: `O cliente/destinatário com ID "${safeCli}" NÃO foi encontrado na tabela TB_CADUNICO do banco [${config.database}]. Por favor, verifique o código informado ou utilize a busca no banco.`
        });
      }

      const cadRecord: Record<string, any> = qCad?.[0] ? { ...qCad[0] } : {};
      const destUf = safeTipo === 'E' || Number(qCfo[0].TG_IMPORTACAO ?? 0) === 1 ? empUf : safeUf;
      const origemUf = safeTipo === 'E' || Number(qCfo[0].TG_IMPORTACAO ?? 0) === 1 ? safeUf : empUf;
      const sqlText = (value: any) => String(value ?? '').replace(/'/g, '').trim();
      const origemIcmsProduto = sqlText(prodRecord.TG_ORIGEMICMS);
      const regimeTributario = safeTipo === 'E'
        ? sqlText(empRecord.TG_REGIMETRIBUTARIO)
        : sqlText(cadRecord.FK_REGIMETRIBUTARIO);
      const regimeTributarioEmitente = safeTipo === 'E'
        ? sqlText(cadRecord.FK_REGIMETRIBUTARIO)
        : sqlText(empRecord.TG_REGIMETRIBUTARIO);
      const perfilIcms = Number(cadRecord.TG_CONTRIBUINTEICMS);
      const grupoCfop = Number(qCfo[0].FK_GRUPO);
      if (!Number.isInteger(perfilIcms)) {
        return sendJson(res, 422, { success: false, error: `O cliente "${safeCli}" não possui TG_CONTRIBUINTEICMS numérico. A simulação não inferiu o perfil fiscal.` });
      }
      if (!Number.isInteger(grupoCfop)) {
        return sendJson(res, 422, { success: false, error: `O CFOP "${safeCfop}" não possui FK_GRUPO numérico. A simulação não inferiu o grupo de CFOP.` });
      }

      // 5. ALÍQUOTA ESTADO (TB_ICMS: FK_UFORIGEM e FK_UFDESTINO conforme NFE_CALCULARITEM.PRG)
      let qIcm = await safeQuery(pool, `
        SELECT TOP 1 ICM.VL_PORICMCONS, ICM.VL_PORICM
        FROM TB_ICMS ICM
        WHERE ICM.FK_UFORIGEM = '${origemUf}' AND ICM.FK_UFDESTINO = '${destUf}'
      `);
      if (!qIcm || qIcm.length === 0) {
        return sendJson(res, 422, { success: false, error: `Não existe TB_ICMS para a rota ${origemUf} → ${destUf}. Nenhuma alíquota alternativa foi usada.` });
      }

      // 6. CLASSIFICAÇÃO FISCAL NCM (TB_CLAFIS)
      if (!fkClafis) {
        return sendJson(res, 422, { success: false, error: `O produto "${prodPk}" não possui FK_CLAFIS. O PRG depende dessa classificação e a simulação não aplicou NCM padrão.` });
      }
      let qCf = await safeQuery(pool, `
        SELECT TOP 1
          CLA.PK_ID,
          COALESCE(CLA.NR_CLAFIS, CLA.DS_CLAFIS, '') AS CD_CLAFIS,
          COALESCE(CLA.NR_CLAFIS, CLA.DS_CLAFIS, '') AS NR_CLAFIS,
          CLA.NR_SITTRIBIPISAI, CLA.NR_SITTRIBIPIENT, CLA.VL_PORIPI,
          CLA.FK_ENQUADRAMENTOIPI, CLA.FK_ENQUADRAMENTOIPIENT,
          CLA.VL_PORPIS, CLA.VL_PORPISIMP, CLA.VL_PORCOFINS, CLA.VL_PORCOFINSIMP,
          COALESCE(IPI.TG_IPI, 0) AS TG_IPI,
          COALESCE(IPIENT.TG_IPI, 0) AS TG_IPIENT
        FROM TB_CLAFIS CLA
        LEFT JOIN TB_SITTRIBIPI IPI ON IPI.PK_ID = CLA.NR_SITTRIBIPISAI
        LEFT JOIN TB_SITTRIBIPI IPIENT ON IPIENT.PK_ID = CLA.NR_SITTRIBIPIENT
        WHERE RTRIM(LTRIM(CAST(CLA.PK_ID AS VARCHAR(50)))) = '${fkClafis}'
      `);

      if (qCf === null) {
        qCf = await safeQuery(pool, `
          SELECT TOP 1 *,
            COALESCE(NR_CLAFIS, DS_CLAFIS, '') AS CD_CLAFIS,
            COALESCE(NR_CLAFIS, DS_CLAFIS, '') AS NR_CLAFIS
          FROM TB_CLAFIS CLA
          WHERE RTRIM(LTRIM(CAST(CLA.PK_ID AS VARCHAR(50)))) = '${fkClafis}'
        `);
      }

      if (!qCf || qCf.length === 0) {
        return sendJson(res, 422, { success: false, error: `A classificação fiscal "${fkClafis}" do produto "${prodPk}" não foi localizada em TB_CLAFIS. Nenhuma alíquota foi inferida.` });
      }

      // 7. EXCEÇÃO NCM/UF (TB_CLAFISEXC: FK_ORIGEM = FK_CLAFIS)
      let qCfEx = fkClafis ? await safeQuery(pool, `
        SELECT TOP 1
          CLE.PK_ID, CLE.CD_SITTRIBUTARIA, CLE.VL_PORREDUICMS, CLE.VL_PORICMS, CLE.FK_INFCOMPL,
          CLE.TG_CONTRIBUINTE, COALESCE(CLE.CD_BENEFIS, '') AS CD_BENEFIS,
          COALESCE(CLE.FK_MOTIVODESONICMS, 0) AS FK_MOTIVODESONICMS,
          COALESCE(CLE.NR_CEST, '') AS NR_CEST
        FROM TB_CLAFISEXC CLE
        WHERE CLE.FK_ORIGEM = '${fkClafis}'
          AND CLE.FK_UFORIGEM = '${origemUf}'
          AND CLE.FK_UFDESTINO = '${destUf}'
          AND CLE.TG_ORIGEMICMS IN ('', '${origemIcmsProduto}')
          AND CLE.FK_REGIMETRIBUTARIO IN ('', '${regimeTributario}')
          AND CLE.FK_REGIMETRIBUTARIOEMITENTE IN ('', '${regimeTributarioEmitente}')
          AND CLE.TG_CONTRIBUINTE IN (4, ${perfilIcms})
          AND CLE.TG_INATIVO = 0
          AND CLE.DS_ORIGEM = 'ICMS'
          AND ((CLE.DT_VIGENCIAINICIAL IS NOT NULL AND ${sqlDataEmissao} BETWEEN CLE.DT_VIGENCIAINICIAL AND CLE.DT_VIGENCIAFINAL) OR CLE.DT_VIGENCIAINICIAL IS NULL)
        ORDER BY CLE.TG_ORIGEMICMS DESC, CLE.FK_REGIMETRIBUTARIO DESC, CLE.FK_REGIMETRIBUTARIOEMITENTE DESC
      `) : null;

      // O PRG abre cursores independentes para PIS e COFINS. A condição e a
      // ordem importam: uma exceção de ICMS não pode ser reutilizada aqui.
      const qCfExPis = await safeQuery(pool, `
        SELECT
          CLE.PK_ID, CLE.CD_SITTRIBUTARIA, CLE.VL_PORICMS, CLE.FK_INFCOMPL,
          CLE.TG_CONTRIBUINTE, COALESCE(PIS.TG_PIS, 0) AS TG_PIS
        FROM TB_CLAFISEXC CLE
        LEFT JOIN TB_SITTRIBPIS PIS ON PIS.PK_ID = CLE.CD_SITTRIBUTARIA
        WHERE CLE.FK_ORIGEM = '${fkClafis}'
          AND CLE.FK_UFORIGEM = '${empUf}'
          AND CLE.FK_UFDESTINO = '${safeUf}'
          AND CLE.TG_ORIGEMICMS IN ('', '${origemIcmsProduto}')
          AND CLE.FK_REGIMETRIBUTARIO IN ('', '${sqlText(cadRecord.FK_REGIMETRIBUTARIO)}')
          AND CLE.FK_REGIMETRIBUTARIOEMITENTE IN ('', '${sqlText(empRecord.TG_REGIMETRIBUTARIO)}')
          AND CLE.FK_CADUNICO IN (0, ${safeCli})
          AND CLE.TG_CONTRIBUINTE IN (4, ${perfilIcms})
          AND CLE.TG_INATIVO = 0
          AND CLE.DS_ORIGEM = 'PIS'
          AND ((CLE.DT_VIGENCIAINICIAL IS NOT NULL AND ${sqlDataEmissao} BETWEEN CLE.DT_VIGENCIAINICIAL AND CLE.DT_VIGENCIAFINAL) OR CLE.DT_VIGENCIAINICIAL IS NULL)
        ORDER BY CLE.TG_ORIGEMICMS DESC, CLE.FK_REGIMETRIBUTARIO DESC, CLE.FK_REGIMETRIBUTARIOEMITENTE DESC, CLE.FK_CADUNICO DESC
      `);
      const qCfExCofins = await safeQuery(pool, `
        SELECT
          CLE.PK_ID, CLE.CD_SITTRIBUTARIA, CLE.VL_PORICMS, CLE.FK_INFCOMPL,
          CLE.TG_CONTRIBUINTE, COALESCE(COFINS.TG_COFINS, 0) AS TG_COFINS
        FROM TB_CLAFISEXC CLE
        LEFT JOIN TB_SITTRIBCOFINS COFINS ON COFINS.PK_ID = CLE.CD_SITTRIBUTARIA
        WHERE CLE.FK_ORIGEM = '${fkClafis}'
          AND CLE.FK_UFORIGEM = '${empUf}'
          AND CLE.FK_UFDESTINO = '${safeUf}'
          AND CLE.TG_ORIGEMICMS IN ('', '${origemIcmsProduto}')
          AND CLE.FK_REGIMETRIBUTARIO IN ('', '${sqlText(cadRecord.FK_REGIMETRIBUTARIO)}')
          AND CLE.FK_REGIMETRIBUTARIOEMITENTE IN ('', '${sqlText(empRecord.TG_REGIMETRIBUTARIO)}')
          AND CLE.FK_CADUNICO IN (0, ${safeCli})
          AND CLE.TG_CONTRIBUINTE IN (4, ${perfilIcms})
          AND CLE.TG_INATIVO = 0
          AND CLE.DS_ORIGEM = 'COFINS'
          AND ((CLE.DT_VIGENCIAINICIAL IS NOT NULL AND ${sqlDataEmissao} BETWEEN CLE.DT_VIGENCIAINICIAL AND CLE.DT_VIGENCIAFINAL) OR CLE.DT_VIGENCIAINICIAL IS NULL)
        ORDER BY CLE.TG_ORIGEMICMS DESC, CLE.FK_REGIMETRIBUTARIO DESC, CLE.FK_REGIMETRIBUTARIOEMITENTE DESC, CLE.FK_CADUNICO DESC
      `);

      if (qCfEx === null || qCfExPis === null || qCfExCofins === null) {
        return sendJson(res, 422, { success: false, error: 'Falha ao abrir uma consulta de exceção TB_CLAFISEXC. O simulador não tratou a falha como ausência de regra.' });
      }

      const qFcpIcms = await safeQuery(pool, `
        SELECT TOP 1 FCP.VL_PORICMFCPUFDEST
        FROM TB_CLAFISFCP FCP
        WHERE FCP.FK_CLAFIS = '${fkClafis}'
          AND FCP.FK_UF = '${destUf}'
          AND FCP.TG_DESTINOFCP IN (3, 2)
          AND FCP.TG_INATIVO = 0
        ORDER BY FCP.TG_DESTINOFCP
      `);
      const qDifIcms = await safeQuery(pool, `
        SELECT TOP 1
          DIF.PK_ID, DIF.FK_UFORIGEM, DIF.FK_UFDESTINO, DIF.FK_INFCOMPL,
          DIF.CD_SITTRIBUTARIA, DIF.VL_PORDIFERIMENTOICMS,
          COALESCE(DIF.CD_BENEFIS, '') AS CD_BENEFIS
        FROM TB_CLAFISDIFERIMENTOICMS DIF
        WHERE DIF.FK_CLAFIS = '${fkClafis}'
          AND DIF.FK_UFORIGEM = '${origemUf}'
          AND DIF.FK_UFDESTINO = '${destUf}'
          AND DIF.FK_CADUNICO IN (0, ${safeCli})
          AND COALESCE(DIF.TG_INATIVO, 0) = 0
        ORDER BY DIF.FK_CADUNICO DESC
      `);

      // 8. EXCEÇÃO CLIENTE (TB_EXCECAOICMS)
      let qCfExCad = await safeQuery(pool, `
        SELECT TOP 1
          CADEXC.PK_ID, CADEXC.CD_SITTRIBUTARIA, CADEXC.VL_PORREDUICMS, CADEXC.VL_PORICMS,
          CADEXC.FK_MOTIVODESONICMS, CADEXC.CD_BENEFIS, CADEXC.FK_INFCOMPL, CADEXC.NR_CEST
        FROM TB_EXCECAOICMS CADEXC
        WHERE CADEXC.FK_CADUNICO = ${safeCli}
          AND CADEXC.TG_INATIVO = 0
          AND CADEXC.FK_CLAFIS IN ('', '${fkClafis}')
          AND CADEXC.TG_ICMSIPI IN (0, ${safeDestMer})
          AND CADEXC.TG_ORIGEMICMS IN ('', '${origemIcmsProduto}')
          AND ((CADEXC.DT_VIGENCIAINICIAL IS NOT NULL AND ${sqlDataEmissao} BETWEEN CADEXC.DT_VIGENCIAINICIAL AND CADEXC.DT_VIGENCIAFINAL) OR CADEXC.DT_VIGENCIAINICIAL IS NULL)
        ORDER BY CADEXC.FK_CLAFIS DESC, CADEXC.TG_ORIGEMICMS DESC, CADEXC.TG_ICMSIPI DESC
      `);

      // 9. REGRAS GERAIS DE IMPOSTO. Cada cursor tem filtros e ordenação próprios
      // no PRG; uma consulta genérica muda a regra vencedora da pirâmide.
      const filtrosRegraFederal = `
          AND REGRA.FK_REGIMETRIBUTARIO IN ('', '${regimeTributario}')
          AND REGRA.FK_REGIMETRIBUTARIOEMITENTE IN ('', '${regimeTributarioEmitente}')
          AND REGRA.FK_PRODUTO IN ('', '${prodPk}')
          AND REGRA.FK_CADUNICO IN (0, ${safeCli})
          AND REGRA.FK_EMPRESA IN ('', '${safeEmp}')
          AND REGRA.FK_CLAFIS IN ('', '${fkClafis}')
          AND REGRA.TG_ICMSIPI IN (0, ${safeDestMer})
          AND REGRA.FK_GRUPOCFOP IN (0, ${grupoCfop})
          AND REGRA.TG_INATIVO = 0
          AND REGRA.TG_ORIGEM IN ('', 'V')
          AND REGRA.TG_CONTRIBUINTE IN (4, ${perfilIcms})`;
      const ordemRegraFederal = `
          ORDER BY REGRA.FK_REGIMETRIBUTARIO DESC, REGRA.FK_REGIMETRIBUTARIOEMITENTE DESC,
            REGRA.FK_PRODUTO DESC, REGRA.FK_CADUNICO DESC, REGRA.FK_EMPRESA DESC,
            REGRA.FK_CLAFIS DESC, REGRA.TG_ICMSIPI DESC, REGRA.FK_GRUPOCFOP DESC,
            REGRA.TG_CONTRIBUINTE`;

      const qRegrasIcm = await safeQuery(pool, `
        SELECT REGRA.TG_IMPOSTO, REGRA.CD_SITRIBUTARIA, REGRA.VL_PORIMPOSTO,
          REGRA.VL_PORREDUCAO, REGRA.VL_ALIQBASE, REGRA.VL_PORCSUBS,
          REGRA.FK_INFCOMPL, REGRA.TG_DEDUZIR, REGRA.TG_ICMSIPI,
          REGRA.TG_CONTRIBUINTE, REGRA.FK_MOTIVODESONICMS, REGRA.CD_BENEFIS,
          REGRA.VL_PORICMFCP, REGRA.FK_CALCDIFAL, COALESCE(REGRA.NR_CEST, '') AS NR_CEST
        FROM TB_REGRAIMPOSTO REGRA
        WHERE REGRA.TG_IMPOSTO IN ('ICMS', 'ICMSST')
          AND REGRA.FK_UFORIGEM = '${origemUf}'
          AND REGRA.FK_UFDESTINO = '${destUf}'
          AND REGRA.FK_REGIMETRIBUTARIO IN ('', '${regimeTributario}')
          AND REGRA.FK_REGIMETRIBUTARIOEMITENTE IN ('', '${regimeTributarioEmitente}')
          AND REGRA.FK_PRODUTO IN ('', '${prodPk}')
          AND REGRA.FK_CADUNICO IN (0, ${safeCli})
          AND REGRA.FK_EMPRESA IN ('', '${safeEmp}')
          AND REGRA.FK_CLAFIS IN ('', '${fkClafis}')
          AND REGRA.TG_ORIGEMICMS IN ('', '${origemIcmsProduto}')
          AND REGRA.TG_ICMSIPI IN (0, ${safeDestMer})
          AND REGRA.FK_GRUPOCFOP IN (0, ${grupoCfop})
          AND REGRA.TG_INATIVO = 0
          AND REGRA.TG_ORIGEM IN ('', 'V')
          AND REGRA.TG_CONTRIBUINTE IN (4, ${perfilIcms})
          AND ((REGRA.DT_VIGENCIAINICIAL IS NOT NULL AND ${sqlDataEmissao} BETWEEN REGRA.DT_VIGENCIAINICIAL AND REGRA.DT_VIGENCIAFINAL) OR REGRA.DT_VIGENCIAINICIAL IS NULL)
        ORDER BY REGRA.TG_IMPOSTO, REGRA.FK_REGIMETRIBUTARIO DESC,
          REGRA.FK_REGIMETRIBUTARIOEMITENTE DESC, REGRA.FK_PRODUTO DESC,
          REGRA.FK_CADUNICO DESC, REGRA.FK_EMPRESA DESC, REGRA.FK_CLAFIS DESC,
          REGRA.TG_ORIGEMICMS DESC, REGRA.TG_ICMSIPI DESC, REGRA.FK_GRUPOCFOP DESC,
          REGRA.TG_CONTRIBUINTE
      `);
      const qRegrasCofins = await safeQuery(pool, `
        SELECT REGRA.TG_IMPOSTO, REGRA.CD_SITRIBUTARIA, REGRA.VL_PORIMPOSTO,
          REGRA.VL_ALIQBASE, REGRA.FK_INFCOMPL
        FROM TB_REGRAIMPOSTO REGRA
        WHERE REGRA.TG_IMPOSTO = 'COFINS'
          ${filtrosRegraFederal}
          AND ((REGRA.DT_VIGENCIAINICIAL IS NOT NULL AND ${sqlDataEmissao} BETWEEN REGRA.DT_VIGENCIAINICIAL AND REGRA.DT_VIGENCIAFINAL) OR REGRA.DT_VIGENCIAINICIAL IS NULL)
          ${ordemRegraFederal}
      `);
      const qRegrasPis = await safeQuery(pool, `
        SELECT REGRA.TG_IMPOSTO, REGRA.CD_SITRIBUTARIA, REGRA.VL_PORIMPOSTO,
          REGRA.VL_ALIQBASE, REGRA.FK_INFCOMPL
        FROM TB_REGRAIMPOSTO REGRA
        WHERE REGRA.TG_IMPOSTO = 'PIS'
          ${filtrosRegraFederal}
          AND ((REGRA.DT_VIGENCIAINICIAL IS NOT NULL AND ${sqlDataEmissao} BETWEEN REGRA.DT_VIGENCIAINICIAL AND REGRA.DT_VIGENCIAFINAL) OR REGRA.DT_VIGENCIAINICIAL IS NULL)
          ${ordemRegraFederal}
      `);
      const qRegrasIpi = await safeQuery(pool, `
        SELECT REGRA.TG_IMPOSTO, REGRA.CD_SITRIBUTARIA, REGRA.VL_PORIMPOSTO,
          REGRA.VL_ALIQBASE, REGRA.FK_INFCOMPL, REGRA.FK_ENQUADRAMENTOIPI
        FROM TB_REGRAIMPOSTO REGRA
        WHERE REGRA.TG_IMPOSTO = 'IPI'
          ${filtrosRegraFederal}
          ${ordemRegraFederal}
      `);

      if (qRegrasIcm === null || qRegrasIpi === null || qRegrasPis === null || qRegrasCofins === null) {
        return sendJson(res, 422, { success: false, error: 'Falha ao abrir uma das consultas TB_REGRAIMPOSTO do NFE_CALCULARITEM.PRG. Nenhuma regra genérica foi usada.' });
      }

      // 10. SUBSTITUIÇÃO TRIBUTÁRIA (TB_SUBSTRIBUTARIA)
      let qSt = fkClafis ? await safeQuery(pool, `
        SELECT TOP 1
          ST.PK_ID, ST.CD_SITTRIBUTARIA, ST.FK_INFCOMPL, ST.VL_BASEARBITRADA, ST.VL_ALIQBASE, ST.VL_PORCSUBS,
          ST.TG_CALCSUBSEMICM, ST.TG_DEDUZIR, ST.VL_PORREDUICMS, ST.TG_NAOUTILIZARPAUTA,
          COALESCE(ST.VL_PORICMFCP, 0) AS VL_PORICMFCP, COALESCE(ST.FK_MODBCIND, '') AS FK_MODBCIND,
          COALESCE(ST.TG_SEMICMSOPERACAO, 0) AS TG_SEMICMSOPERACAO,
          COALESCE(ST.FK_CALCDIFAL, 0) AS FK_CALCDIFAL,
          COALESCE(ST.TG_SUBTRAIRFCPICMS, 0) AS TG_SUBTRAIRFCPICMS,
          COALESCE(ST.NR_CEST, '') AS NR_CEST
        FROM TB_SUBSTRIBUTARIA ST
        WHERE ST.FK_CLAFIS = '${fkClafis}'
          AND ST.TG_ICMSIPI = ${safeDestMer}
          AND ST.FK_UFORIGEM = '${origemUf}'
          AND ST.FK_ESTADO = '${destUf}'
          AND ST.TG_CLIENTE IN (4, ${perfilIcms})
          AND ST.FK_REGIMETRIBUTARIO IN ('', '${regimeTributario}')
          AND ST.FK_REGIMETRIBUTARIOEMITENTE IN ('', '${regimeTributarioEmitente}')
          AND ST.TG_INATIVO <> 1
          AND ((ST.DT_VIGENCIAINICIAL IS NOT NULL AND ${sqlDataEmissao} BETWEEN ST.DT_VIGENCIAINICIAL AND ST.DT_VIGENCIAFINAL) OR ST.DT_VIGENCIAINICIAL IS NULL)
        ORDER BY ST.FK_REGIMETRIBUTARIO DESC, ST.FK_REGIMETRIBUTARIOEMITENTE DESC, ST.TG_CLIENTE
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
      const qSitTribIpi = await safeQuery(pool, `SELECT PK_ID, TG_IPI FROM TB_SITTRIBIPI`);
      const qSitTribPis = await safeQuery(pool, `SELECT PK_ID, TG_PIS FROM TB_SITTRIBPIS`);
      const qSitTribCofins = await safeQuery(pool, `SELECT PK_ID, TG_COFINS FROM TB_SITTRIBCOFINS`);

      if (!qSitTrib?.length || !qSitTribIpi?.length || !qSitTribPis?.length || !qSitTribCofins?.length) {
        return sendJson(res, 422, { success: false, error: 'Uma tabela de situação tributária necessária está vazia ou indisponível. A simulação não usou listas fixas de CST.' });
      }

      // 13. DESTINO DA MERCADORIA (TB_DESTINOMERCADORIA - L2070 do NFE_CALCULARITEM.PRG)
      const qDest = await safeQuery(pool, `
        SELECT TOP 1
          COALESCE(DEST.TG_CALCICMSST, 0) AS TG_CALCICMSST,
          COALESCE(DEST.TG_IPISOMABCICMS, 0) AS TG_IPISOMABCICMS
        FROM TB_DESTINOMERCADORIA AS DEST
        WHERE DEST.PK_ID = ${safeDestMer}
      `);
      if (!qDest || qDest.length === 0) {
        return sendJson(res, 422, { success: false, error: `O destino da mercadoria "${safeDestMer}" não foi localizado em TB_DESTINOMERCADORIA.` });
      }

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
          tmpCalCfo: qCfo[0],
          tmpCalPro: prodRecord,
          tmpCalEmp: empRecord,
          tmpCalCad: cadRecord,
          tmpCalIcm: qIcm[0],
          tmpCalCf: qCf[0],
          tmpCalCfEx: qCfEx?.[0] || {},
          tmpCalCfExCad: qCfExCad?.[0] || {},
          tmpCalCfExPis: qCfExPis,
          tmpCalCfExCofins: qCfExCofins,
          tmpCalCfFcpIcms: qFcpIcms?.[0] || {},
          tmpCalCfDiferimentoIcms: qDifIcms?.[0] || {},
          tmpCalIcmSt: qSt?.[0] || {},
          tmpRegraImpIcm: qRegrasIcm,
          tmpRegraImpIpi: qRegrasIpi,
          tmpRegraImpPis: qRegrasPis,
          tmpRegraImpCofins: qRegrasCofins,
          tmpSitTributariaIcms: qSitTrib,
          tmpSitTribIpi: qSitTribIpi,
          tmpSitTribPis: qSitTribPis,
          tmpSitTribCofins: qSitTribCofins,
          tmpDest: qDest[0],
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
