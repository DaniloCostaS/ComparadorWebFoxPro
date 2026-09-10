const sql = require('mssql');
async function run() {
  const pool = await sql.connect('mssql://sa:Pwi@123@localhost/VolpeDesenvF2');
  const r = await pool.request().query("SELECT PK_ID, NR_SITTRIBIPI, TG_IPI, NR_SITTRIBPIS, NR_SITTRIBCOFINS FROM TB_CFOP WHERE PK_ID = 5102");
  console.log(r.recordset);
  process.exit();
}
run();
