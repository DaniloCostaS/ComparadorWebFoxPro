import type { BusinessRuleError } from '../xmlValidator';

export interface BusinessRuleContext {
  xmlDoc: Document;
  rawXml: string;
}

export type BusinessRuleFn = (context: BusinessRuleContext) => BusinessRuleError[];

/**
 * Função utilitária para buscar o valor numérico (float) de uma tag.
 * Retorna 0 caso a tag não exista ou esteja vazia.
 */
export function getFloat(element: Element | Document, tagName: string): number {
  const el = element.getElementsByTagName(tagName)[0];
  if (el && el.textContent) {
    const val = parseFloat(el.textContent);
    return isNaN(val) ? 0 : val;
  }
  return 0;
}

/**
 * Retorna o texto de uma tag filha, ou undefined caso não exista.
 */
export function getText(element: Element | Document, tagName: string): string | undefined {
  const el = element.getElementsByTagName(tagName)[0];
  return el?.textContent || undefined;
}
