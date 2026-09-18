export interface MissingIndex {
  database: string;
  schema: string;
  table: string;
  impact: string;
  equalityColumns: string[];
  inequalityColumns: string[];
  includeColumns: string[];
  createScript: string;
}

export interface CostlyOperation {
  physicalOp: string;
  logicalOp: string;
  estimateRows: string;
  estimatedTotalSubtreeCost: number;
  nodeCost: number;
  nodeCostPercent: number;
  object: string;
}

export interface DangerousScan {
  physicalOp: string;
  logicalOp: string;
  object: string;
  estimatedTotalSubtreeCost: number;
  nodeCost: number;
  nodeCostPercent: number;
}

export interface SargabilityWarning {
  statement: string;
  issue: string;
  suggestion: string;
}

export interface ImplicitConversionWarning {
  expression: string;
  issue: string;
}

export interface SqlPlanAnalysis {
  missingIndexes: MissingIndex[];
  costlyOperations: CostlyOperation[];
  dangerousScans: DangerousScan[];
  sargabilityWarnings: SargabilityWarning[];
  implicitConversions: ImplicitConversionWarning[];
}

function getElementsByNameSafe(parent: Element | Document, name: string): Element[] {
  const byNs = Array.from(parent.getElementsByTagNameNS('*', name));
  if (byNs.length > 0) return byNs;
  return Array.from(parent.getElementsByTagName(name));
}

export function parseSqlPlan(xmlString: string): SqlPlanAnalysis {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  // Verifica se houve erro de parse
  const parseError = doc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error('XML Inválido ou mal formatado.');
  }

  const missingIndexes = extractMissingIndexes(doc);
  const allOps = extractAllRelOps(doc);

  // Calcula custo total do plano (soma de todos os custos de nó individuais)
  const totalCost = allOps.reduce((sum, op) => sum + op.nodeCost, 0);

  // Atualiza as porcentagens de custo em cada nó
  allOps.forEach(op => {
    op.nodeCostPercent = totalCost > 0 ? (op.nodeCost / totalCost) * 100 : 0;
  });

  // Consideramos as 10 operações mais custosas baseadas no NodeCost (Custo isolado do nó)
  const sortedOps = [...allOps].sort((a, b) => b.nodeCost - a.nodeCost);
  const costlyOperations = sortedOps.slice(0, 10);

  // Scans Perigosos
  const dangerousScans = allOps
    .filter(op => op.physicalOp === 'Table Scan' || op.physicalOp === 'Clustered Index Scan')
    .sort((a, b) => b.estimatedTotalSubtreeCost - a.estimatedTotalSubtreeCost);

  const sargabilityWarnings = extractSargabilityWarnings(doc);
  const implicitConversions = extractImplicitConversions(doc);

  return { missingIndexes, costlyOperations, dangerousScans, sargabilityWarnings, implicitConversions };
}

function extractMissingIndexes(doc: Document): MissingIndex[] {
  const results: MissingIndex[] = [];
  const missingIndexElements = getElementsByNameSafe(doc, 'MissingIndex');

  for (const el of missingIndexElements) {
    const parentGroup = el.parentElement; // MissingIndexGroup
    const impact = parentGroup ? parentGroup.getAttribute('Impact') || '0' : '0';

    const database = el.getAttribute('Database') || '';
    const schema = el.getAttribute('Schema') || '';
    const table = el.getAttribute('Table') || '';

    const equalityColumns: string[] = [];
    const inequalityColumns: string[] = [];
    const includeColumns: string[] = [];

    const colGroups = getElementsByNameSafe(el, 'ColumnGroup');

    for (const group of colGroups) {
      const usage = group.getAttribute('Usage');
      const cols = getElementsByNameSafe(group, 'Column');
      const colNames = cols.map(c => c.getAttribute('Name') || '').filter(Boolean);
      
      if (usage === 'EQUALITY') equalityColumns.push(...colNames);
      if (usage === 'INEQUALITY') inequalityColumns.push(...colNames);
      if (usage === 'INCLUDE') includeColumns.push(...colNames);
    }

    // Gerar script CREATE INDEX
    const safeTable = table.replace(/\[|\]/g, '');
    const safeSchema = schema.replace(/\[|\]/g, '');
    const tableNameFull = `${schema ? `[${safeSchema}].` : ''}[${safeTable}]`;
    const idxName = `IX_${safeTable}_${Math.floor(Math.random() * 10000)}`;
    
    let script = `CREATE NONCLUSTERED INDEX [${idxName}]\nON ${tableNameFull} (`;
    
    const indexCols = [...equalityColumns, ...inequalityColumns].map(c => `[${c.replace(/\[|\]/g, '')}]`);
    script += indexCols.join(', ') + `)`;

    if (includeColumns.length > 0) {
      const incCols = includeColumns.map(c => `[${c.replace(/\[|\]/g, '')}]`);
      script += `\nINCLUDE (${incCols.join(', ')})`;
    }
    script += ';';

    // Evitar duplicações caso haja nós idênticos
    const exists = results.some(r => r.table === table && r.impact === impact);
    if (!exists) {
      results.push({
        database,
        schema,
        table,
        impact,
        equalityColumns,
        inequalityColumns,
        includeColumns,
        createScript: script
      });
    }
  }

  return results.sort((a, b) => parseFloat(b.impact) - parseFloat(a.impact));
}

function extractAllRelOps(doc: Document): CostlyOperation[] {
  const results: CostlyOperation[] = [];
  const opsList = getElementsByNameSafe(doc, 'RelOp');

  for (const op of opsList) {
    const physicalOp = op.getAttribute('PhysicalOp') || '';
    const logicalOp = op.getAttribute('LogicalOp') || '';
    const estimateRows = op.getAttribute('EstimateRows') || '0';
    const estimatedTotalSubtreeCost = parseFloat(op.getAttribute('EstimatedTotalSubtreeCost') || '0');

    // Calcula o custo real do nó (Custo da subárvore - Custo da subárvore dos filhos diretos)
    let childrenSubtreeCost = 0;
    const allChildRelOps = getElementsByNameSafe(op, 'RelOp');
    
    const directChildRelOps = allChildRelOps.filter(child => {
      let parent = child.parentElement;
      while (parent && parent !== op && parent.localName !== 'RelOp') {
        parent = parent.parentElement;
      }
      return parent === op;
    });

    for (const child of directChildRelOps) {
      childrenSubtreeCost += parseFloat(child.getAttribute('EstimatedTotalSubtreeCost') || '0');
    }

    let nodeCost = estimatedTotalSubtreeCost - childrenSubtreeCost;
    if (nodeCost < 0) nodeCost = 0; // Prevenir imprecisão de ponto flutuante

    // Extrair o nome do objeto (Tabela/Índice)
    let objectName = '';
    const objectEls = getElementsByNameSafe(op, 'Object');
    if (objectEls.length > 0) {
      const obj = objectEls[0]; // O primeiro Objeto associado a essa operação
      const db = obj.getAttribute('Database') || '';
      const schema = obj.getAttribute('Schema') || '';
      const table = obj.getAttribute('Table') || '';
      const index = obj.getAttribute('Index') || '';
      
      const parts = [db, schema, table].filter(Boolean).join('.');
      objectName = index ? `${parts} (${index})` : parts;
    }

    results.push({
      physicalOp,
      logicalOp,
      estimateRows,
      estimatedTotalSubtreeCost,
      nodeCost,
      nodeCostPercent: 0, // será calculado posteriormente
      object: objectName || 'N/A'
    });
  }

  return results;
}

function extractSargabilityWarnings(doc: Document): SargabilityWarning[] {
  const warnings: SargabilityWarning[] = [];
  const stmts = getElementsByNameSafe(doc, 'StmtSimple');
  
  for (const stmt of stmts) {
    const text = stmt.getAttribute('StatementText') || '';
    if (!text) continue;
    
    // Função na cláusula WHERE afetando a coluna (não-SARGable)
    const functionRegex = /WHERE\s+(?:.*?\bAND\b\s+)*\b(YEAR|MONTH|DAY|CAST|CONVERT|SUBSTRING|ISNULL|COALESCE)\s*\(/i;
    if (functionRegex.test(text)) {
      warnings.push({
        statement: text,
        issue: 'Uso de função na cláusula WHERE (Não-SARGable).',
        suggestion: 'Aplicar funções diretamente na coluna (ex: `YEAR(data) = 2023`) impede o banco de usar índices. Tente isolar a coluna (ex: `data >= \'2023-01-01\' AND data <= \'2023-12-31\'`).'
      });
    }

    // Coringa no início da string LIKE '%texto'
    const likeRegex = /LIKE\s+'%[^']+'/i;
    if (likeRegex.test(text)) {
      warnings.push({
        statement: text,
        issue: "Busca curinga no início da string (LIKE '%texto').",
        suggestion: "O caractere '%' no início da string faz com que o banco ignore o índice e faça um Scan completo. Se possível, use apenas prefixos (ex: `LIKE 'texto%'`) ou implemente Full-Text Search."
      });
    }
  }

  // Deduplicar warnings
  const uniqueWarnings: SargabilityWarning[] = [];
  warnings.forEach(w => {
    if (!uniqueWarnings.some(u => u.issue === w.issue && u.statement === w.statement)) {
      uniqueWarnings.push(w);
    }
  });

  return uniqueWarnings;
}

function extractImplicitConversions(doc: Document): ImplicitConversionWarning[] {
  const warnings: ImplicitConversionWarning[] = [];
  const convertNodes = getElementsByNameSafe(doc, 'PlanAffectingConvert');
  
  for (const node of convertNodes) {
    const issue = node.getAttribute('ConvertIssue') || '';
    const expression = node.getAttribute('Expression') || 'Desconhecida';

    if (issue === 'Cardinality Estimate' || issue === 'Seek Plan') {
      warnings.push({
        expression,
        issue: 'Você está comparando tipos de dados diferentes (ex: texto com número ou VARCHAR com NVARCHAR). O banco está precisando converter cada linha da tabela antes de comparar. Corrija o tipo da variável no seu código ou parâmetro.'
      });
    }
  }
  
  const uniqueWarnings: ImplicitConversionWarning[] = [];
  warnings.forEach(w => {
    if (!uniqueWarnings.some(u => u.expression === w.expression)) {
      uniqueWarnings.push(w);
    }
  });

  return uniqueWarnings;
}
