import type { BusinessRuleError } from './xmlValidator';
import { businessRules, type BusinessRuleContext } from './rules';

/**
 * Ponto de entrada principal para validação de Regras de Negócio (RN).
 */
export function validateBusinessRules(xmlContent: string): BusinessRuleError[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return [{
        ruleId: 'PARSE_ERROR',
        message: 'XML malformado, impossível validar regras de negócio.',
        severity: 'error'
      }];
    }

    const context: BusinessRuleContext = {
      xmlDoc: doc,
      rawXml: xmlContent
    };

    let allErrors: BusinessRuleError[] = [];
    for (const rule of businessRules) {
      const errors = rule(context);
      allErrors = allErrors.concat(errors);
    }
    
    return allErrors;
  } catch (err: any) {
    return [{
      ruleId: 'ENGINE_ERROR',
      message: `Erro interno no motor de regras: ${err.message}`,
      severity: 'error'
    }];
  }
}
