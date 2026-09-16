import type { BusinessRuleError } from '../xmlValidator';
import { type BusinessRuleContext, getText } from './core';

export function validateFillingRules(context: BusinessRuleContext): BusinessRuleError[] {
  const errors: BusinessRuleError[] = [];
  const doc = context.xmlDoc;
  const nfes = doc.getElementsByTagName('NFe');

  for (let i = 0; i < nfes.length; i++) {
    const nfe = nfes[i];
    const detNodes = nfe.getElementsByTagName('det');
    
    // Obter UFs
    const emit = nfe.getElementsByTagName('emit')[0];
    const dest = nfe.getElementsByTagName('dest')[0];
    
    let ufEmit = '';
    let ufDest = '';
    
    if (emit) {
        const enderEmit = emit.getElementsByTagName('enderEmit')[0];
        if (enderEmit) ufEmit = getText(enderEmit, 'UF') || '';
    }
    if (dest) {
        const enderDest = dest.getElementsByTagName('enderDest')[0];
        if (enderDest) ufDest = getText(enderDest, 'UF') || '';
    }

    for (let j = 0; j < detNodes.length; j++) {
      const det = detNodes[j];
      const prod = det.getElementsByTagName('prod')[0];
      
      if (prod) {
         // Validação de NCM (Nomenclatura Comum do Mercosul)
         const ncm = getText(prod, 'NCM');
         if (ncm) {
             if (ncm !== '00' && !/^\d{8}$/.test(ncm)) {
                errors.push({
                   ruleId: 'I05-NCM',
                   message: `O NCM informado (${ncm}) é inválido. O NCM deve possuir exatamente 8 dígitos numéricos (ou '00' para serviços).`,
                   elementName: 'NCM',
                   relatedPaths: ['prod/NCM'],
                   severity: 'error'
                });
             }
         }

         // Validação de CFOP (Código Fiscal de Operações e Prestações)
         const cfop = getText(prod, 'CFOP');
         if (cfop) {
             if (!/^[123567]\d{3}$/.test(cfop)) {
                errors.push({
                   ruleId: 'I08-CFOP',
                   message: `O CFOP informado (${cfop}) é inválido. Ele deve conter 4 dígitos numéricos começando com 1, 2, 3, 5, 6 ou 7.`,
                   elementName: 'CFOP',
                   relatedPaths: ['prod/CFOP'],
                   severity: 'error'
                });
             } else if (ufEmit && ufDest && ufEmit !== 'EX' && ufDest !== 'EX') {
                const startsWith = cfop.charAt(0);
                const isInterstate = ufEmit !== ufDest;
                
                // 1, 5 = Interno (mesma UF)
                // 2, 6 = Interestadual (UF diferente)
                if (!isInterstate && (startsWith === '2' || startsWith === '6')) {
                   errors.push({
                      ruleId: 'I08-CFOP-UF',
                      message: `CFOP de operação interestadual (${cfop}) mas as UFs de origem e destino são as mesmas (${ufEmit}).`,
                      elementName: 'CFOP',
                      relatedPaths: ['prod/CFOP', 'enderEmit/UF', 'enderDest/UF'],
                      severity: 'error'
                   });
                }
                
                if (isInterstate && (startsWith === '1' || startsWith === '5')) {
                   errors.push({
                      ruleId: 'I08-CFOP-UF',
                      message: `CFOP de operação interna (${cfop}) mas as UFs de origem e destino são diferentes (${ufEmit} -> ${ufDest}).`,
                      elementName: 'CFOP',
                      relatedPaths: ['prod/CFOP', 'enderEmit/UF', 'enderDest/UF'],
                      severity: 'error'
                   });
                }
             }
         }
      }

      // Regra específica de UF limitando algum grupo tributário 
      // Exemplo fictício/comum para ilustrar a arquitetura: Operações destinadas a ZFM (Suframa) e ICMS Desonerado
      if (ufDest === 'AM') {
          const icmsNodes = det.getElementsByTagName('ICMS');
          if (icmsNodes.length > 0) {
              const motDesICMS = getText(icmsNodes[0], 'motDesICMS');
              if (motDesICMS === '7') { // 7 = SUFRAMA
                  // Se for para AM com motivo 7, precisa ter suframa no dest
                  const isuf = getText(dest, 'ISUF');
                  if (!isuf) {
                     errors.push({
                        ruleId: 'E17-SUFRAMA',
                        message: `Operação para o AM com desoneração por SUFRAMA, mas a Inscrição na SUFRAMA (ISUF) não foi informada no destinatário.`,
                        elementName: 'ISUF',
                        relatedPaths: ['dest/ISUF', 'ICMS/motDesICMS'],
                        severity: 'error'
                     });
                  }
              }
          }
      }
    }
  }
  
  return errors;
}
