const sql = require('mssql');
const config = { server: 'localhost', database: 'VolpeDesenvF2', user: 'sa', password: 'sa123', trustServerCertificate: true };
async function run() {
  try {
    let pool = await sql.connect(config);
    let r1 = await pool.request().query("SELECT VL_PORPIS, VL_PORCOFINS FROM TB_CLAFIS WHERE PK_ID = 'NF1'");
    console.log('CLAFIS NF1:', r1.recordset);
    let r2 = await pool.request().query("SELECT FK_CLAFIS FROM TB_PRODUTOS WHERE PK_ID = 'NFE0004'");
    console.log('PROD NFE0004:', r2.recordset);
  } catch(e) { console.error(e); } finally { process.exit(0); }
}
run();
