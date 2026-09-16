import type { BusinessRuleError } from './xmlValidator';

export interface BusinessRuleContext {
  xmlDoc: Document;
  rawXml: string;
}

export type BusinessRuleFn = (context: BusinessRuleContext) => BusinessRuleError[];

export const businessRules: BusinessRuleFn[] = [
  validateIBSCBSTotals,
  validateNFTotals // Exemplo de outra regra (W03, etc) que poderemos adicionar
];

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

// ---------------------------------------------------------
// REGRAS DE NEGÓCIO IMPLEMENTADAS
// ---------------------------------------------------------

/**
 * Regra: Valida se o total vBCIBSCBS confere com o somatório dos itens.
 */
function validateIBSCBSTotals(context: BusinessRuleContext): BusinessRuleError[] {
  const errors: BusinessRuleError[] = [];
  const doc = context.xmlDoc;

  // Handles both <NFe> as root and <enviNFe> with <NFe> children
  const nfes = doc.getElementsByTagName('NFe');
  
  for (let i = 0; i < nfes.length; i++) {
    const nfe = nfes[i];
    
    const detNodes = nfe.getElementsByTagName('det');
    let sumIBSCBS_vBC = 0;
    
    for (let j = 0; j < detNodes.length; j++) {
      const det = detNodes[j];
      const ibscbs = det.getElementsByTagName('IBSCBS')[0];
      if (ibscbs) {
        // Encontra vBC dentro de gIBSCBS que está dentro de IBSCBS
        const gIBSCBS = ibscbs.getElementsByTagName('gIBSCBS')[0];
        if (gIBSCBS) {
           const vBC = gIBSCBS.getElementsByTagName('vBC')[0];
           if (vBC && vBC.textContent) {
              sumIBSCBS_vBC += parseFloat(vBC.textContent);
           }
        }
      }
    }
    
    const totalNode = nfe.getElementsByTagName('total')[0];
    if (totalNode) {
       const ibsCbsTot = totalNode.getElementsByTagName('IBSCBSTot')[0];
       if (ibsCbsTot) {
          const vBCIBSCBS = ibsCbsTot.getElementsByTagName('vBCIBSCBS')[0];
          if (vBCIBSCBS && vBCIBSCBS.textContent) {
             const total_vBCIBSCBS = parseFloat(vBCIBSCBS.textContent);
             
             // Diferença maior que 0.01 (tolerância para arredondamento / float)
             if (Math.abs(total_vBCIBSCBS - sumIBSCBS_vBC) > 0.01) {
                errors.push({
                   ruleId: 'W03-IBSCBS',
                   message: `O valor da Base de Cálculo do IBS/CBS do total da NF-e (${total_vBCIBSCBS.toFixed(2)}) difere do somatório da Base de Cálculo dos itens (${sumIBSCBS_vBC.toFixed(2)}).`,
                   elementName: 'vBCIBSCBS',
                   relatedElements: ['vBCIBSCBS', 'vBC'],
                   relatedPaths: ['IBSCBSTot/vBCIBSCBS', 'gIBSCBS/vBC'],
                   severity: 'error'
                });
             }
          }
       }
    }
  }
  
  return errors;
}

/**
 * Regra: Valida totais genéricos da nota (apenas como placeholder e validação básica do vNF).
 */
function validateNFTotals(context: BusinessRuleContext): BusinessRuleError[] {
  const errors: BusinessRuleError[] = [];
  const doc = context.xmlDoc;
  const nfes = doc.getElementsByTagName('NFe');
  
  for (let i = 0; i < nfes.length; i++) {
    const nfe = nfes[i];
    
    const detNodes = nfe.getElementsByTagName('det');
    let sumVProd = 0;
    
    for (let j = 0; j < detNodes.length; j++) {
      const det = detNodes[j];
      const prod = det.getElementsByTagName('prod')[0];
      if (prod) {
        const vProd = prod.getElementsByTagName('vProd')[0];
        if (vProd && vProd.textContent) {
           sumVProd += parseFloat(vProd.textContent);
        }
      }
    }
    
    const totalNode = nfe.getElementsByTagName('total')[0];
    if (totalNode) {
       const icmsTot = totalNode.getElementsByTagName('ICMSTot')[0];
       if (icmsTot) {
          const vProdTot = icmsTot.getElementsByTagName('vProd')[0];
          if (vProdTot && vProdTot.textContent) {
             const total_vProd = parseFloat(vProdTot.textContent);
             if (Math.abs(total_vProd - sumVProd) > 0.01) {
                errors.push({
                   ruleId: 'W03-VPROD',
                   message: `O valor Total dos Produtos (vProd) no grupo de totais (${total_vProd.toFixed(2)}) difere do somatório de vProd dos itens (${sumVProd.toFixed(2)}).`,
                   elementName: 'vProd',
                   relatedPaths: ['prod/vProd', 'ICMSTot/vProd'],
                   severity: 'error'
                });
             }
          }
       }
    }
  }
  return errors;
}
