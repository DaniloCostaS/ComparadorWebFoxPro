const fs = require('fs');
const file = 'c:/Desenvolvimentos/Comparador/ComparadorWebApp/src/taxSimulator.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Remove fallbacks
code = code.replace(/res\.nrSittribIcms \|\| '-'/g, "res.nrSittribIcms || ''");
code = code.replace(/res\.nrSittribIpi \|\| '-'/g, "res.nrSittribIpi || ''");
code = code.replace(/res\.nrSittribPis \|\| '-'/g, "res.nrSittribPis || ''");
code = code.replace(/res\.nrSittribCofins \|\| '-'/g, "res.nrSittribCofins || ''");

// 2. Add DS_MODELO
code = code.replace(
  `data-prod-desc="\${p.DS_PRODUTO || p.DS_NOME || ''}"`,
  `data-prod-desc="\${p.DS_MODELO || p.DS_PRODUTO || p.DS_NOME || ''}"`
);
code = code.replace(
  `<span class="text-xs font-bold text-gray-900 dark:text-white truncate">\${p.DS_PRODUTO || p.DS_NOME || '(Sem descrição)'}</span>`,
  `<span class="text-xs font-bold text-gray-900 dark:text-white truncate">\${p.DS_MODELO || p.DS_PRODUTO || p.DS_NOME || '(Sem descrição)'}</span>`
);

fs.writeFileSync(file, code);
