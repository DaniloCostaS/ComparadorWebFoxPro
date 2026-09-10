import sql from 'mssql';
import { sqlConfig } from './src/config/dbConfig.ts';

async function run() {
  try {
    let pool = await sql.connect(sqlConfig);
    let result = await pool.request().query(\
      SELECT PRO.PK_ID, PRO.FK_CLAFIS, PRO.DS_PRODUTO, CLA.VL_PORPIS, CLA.VL_PORCOFINS, CLA.NR_SITTRIBPIS, CLA.NR_SITTRIBCOFINS
      FROM TB_PRODUTOS PRO
      LEFT JOIN TB_CLAFIS CLA ON CLA.PK_ID = PRO.FK_CLAFIS
      WHERE PRO.PK_ID = 'NF1'
    \);
    console.log(result.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
