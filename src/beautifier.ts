export interface FormatResult {
  formatted: string;
  error?: string;
  detectedType: 'json' | 'xml' | 'sql' | 'unknown';
}

/**
 * Detecta automaticamente o formato do texto (JSON, XML ou SQL).
 */
export function detectFormat(text: string): 'json' | 'xml' | 'sql' | 'unknown' {
  const trimmed = text.trim();
  if (!trimmed) return 'unknown';

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return 'json';
  }
  if (trimmed.startsWith('<') && (trimmed.endsWith('>') || trimmed.includes('>'))) {
    return 'xml';
  }
  
  const upper = trimmed.toUpperCase();
  if (
    upper.startsWith('SELECT ') || 
    upper.startsWith('INSERT ') || 
    upper.startsWith('UPDATE ') || 
    upper.startsWith('DELETE ') || 
    upper.startsWith('WITH ')
  ) {
    return 'sql';
  }

  // Verificações flexíveis adicionais
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) return 'xml';

  return 'unknown';
}

/**
 * Formata um JSON para melhor leitura.
 */
export function formatJson(text: string, indent: string | number = 2): FormatResult {
  const trimmed = text.trim();
  if (!trimmed) return { formatted: '', detectedType: 'json' };

  try {
    const parsed = JSON.parse(trimmed);
    const indentVal = typeof indent === 'number' 
      ? indent 
      : (indent === '\t' ? '\t' : parseInt(indent, 10) || 2);
    
    const formatted = JSON.stringify(parsed, null, indentVal);
    return { formatted, detectedType: 'json' };
  } catch (err: any) {
    return {
      formatted: text,
      error: `JSON Inválido: ${err.message}`,
      detectedType: 'json'
    };
  }
}

/**
 * Formata um XML minificado (inclusive em linha única) com indentação configurável.
 */
export function formatXml(text: string, indent: string | number = 2): FormatResult {
  const trimmed = text.trim();
  if (!trimmed) return { formatted: '', detectedType: 'xml' };

  const indentStr = typeof indent === 'string' && indent === '\t' 
    ? '\t' 
    : ' '.repeat(typeof indent === 'number' ? indent : parseInt(indent as string, 10) || 2);

  // Validação preliminar com DOMParser quando disponível
  let hasXmlError = false;
  let xmlErrorMessage = '';
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(trimmed, 'application/xml');
    const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
    if (parserError) {
      hasXmlError = true;
      xmlErrorMessage = parserError.textContent?.trim() || 'Estrutura XML malformada.';
    }
  }

  try {
    // Quebrar limites de tags
    const reg = /(>)(<)(\/*)/g;
    const xmlClean = trimmed.replace(reg, '$1\r\n$2$3');
    
    let pad = 0;
    const lines = xmlClean.split('\r\n');
    const resultLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let indentCount = 0;

      // Declaracao XML, Doctype, Comentários ou tags auto-fechadas
      if (line.match(/^<\?xml/i) || line.match(/^<!DOCTYPE/i) || line.match(/^<!--/) || line.match(/\/>$/)) {
        indentCount = 0;
      }
      // Tag com conteúdo inline simples: <nome>Danilo</nome>
      else if (line.match(/^<([^\s>]+)[^>]*>.*<\/([^\s>]+)>$/)) {
        indentCount = 0;
      }
      // Tag de fechamento: </tag>
      else if (line.match(/^<\//)) {
        if (pad > 0) pad -= 1;
        indentCount = 0;
      }
      // Tag de abertura: <tag>
      else if (line.match(/^<[^\/]/)) {
        indentCount = 1;
      }

      resultLines.push(indentStr.repeat(pad) + line);
      pad += indentCount;
    }

    const formatted = resultLines.join('\n');
    return { 
      formatted, 
      error: hasXmlError ? `Alerta no XML: ${xmlErrorMessage}` : undefined,
      detectedType: 'xml' 
    };
  } catch (err: any) {
    return {
      formatted: text,
      error: `XML Inválido: ${err.message}`,
      detectedType: 'xml'
    };
  }
}

/**
 * Formata consultas SQL para melhor visualização.
 */
export function formatSql(text: string, indent: string | number = 2): FormatResult {
  const trimmed = text.trim();
  if (!trimmed) return { formatted: '', detectedType: 'sql' };

  const indentStr = typeof indent === 'string' && indent === '\t' 
    ? '\t' 
    : ' '.repeat(typeof indent === 'number' ? indent : parseInt(indent as string, 10) || 2);

  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT',
    'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
    'UNION ALL', 'UNION', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM'
  ];

  let result = trimmed;
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    result = result.replace(regex, (match) => `\n${match.toUpperCase()}`);
  });

  const lines = result.split('\n').map(l => l.trim()).filter(Boolean);
  const formattedLines = lines.map(line => {
    const upper = line.toUpperCase();
    const isMainClause = keywords.some(kw => upper.startsWith(kw));
    return isMainClause ? line : `${indentStr}${line}`;
  });

  return { formatted: formattedLines.join('\n'), detectedType: 'sql' };
}

/**
 * Minifica (compacta) o texto reduzindo espaços e linhas desnecessárias.
 */
export function minifyText(text: string, type: 'json' | 'xml' | 'sql' | 'unknown'): FormatResult {
  const trimmed = text.trim();
  if (!trimmed) return { formatted: '', detectedType: type };

  const resolvedType = type === 'unknown' ? detectFormat(trimmed) : type;

  if (resolvedType === 'json') {
    try {
      const parsed = JSON.parse(trimmed);
      return { formatted: JSON.stringify(parsed), detectedType: 'json' };
    } catch (e: any) {
      return { formatted: text, error: `Não foi possível minificar (JSON Inválido): ${e.message}`, detectedType: 'json' };
    }
  }

  if (resolvedType === 'xml') {
    const minified = trimmed
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .replace(/>\s+/g, '>')
      .replace(/\s+</g, '<')
      .trim();
    return { formatted: minified, detectedType: 'xml' };
  }

  // Genérico para SQL ou Texto puro
  const minified = trimmed.replace(/\s+/g, ' ').trim();
  return { formatted: minified, detectedType: resolvedType };
}

/**
 * Função principal que formata com base no tipo especificado ou auto-detectado.
 */
export function beautifyText(
  text: string, 
  targetType: 'auto' | 'json' | 'xml' | 'sql' = 'auto', 
  indent: string | number = 2
): FormatResult {
  const detected = targetType === 'auto' ? detectFormat(text) : targetType;

  if (detected === 'json') {
    return formatJson(text, indent);
  } else if (detected === 'xml') {
    return formatXml(text, indent);
  } else if (detected === 'sql') {
    return formatSql(text, indent);
  } else {
    // Tenta primeiro JSON se não sabe, senão XML, se falhar retorna o próprio texto
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const res = formatJson(text, indent);
      if (!res.error) return res;
    }
    if (text.trim().startsWith('<')) {
      return formatXml(text, indent);
    }
    return { formatted: text, detectedType: 'unknown' };
  }
}
