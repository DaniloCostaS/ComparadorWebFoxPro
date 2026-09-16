import type { BusinessRuleError } from '../xmlValidator';
import { type BusinessRuleContext, getFloat } from './core';

export function validateCalculations(context: BusinessRuleContext): BusinessRuleError[] {
  const errors: BusinessRuleError[] = [];
  const doc = context.xmlDoc;
  const nfes = doc.getElementsByTagName('NFe');

  for (let i = 0; i < nfes.length; i++) {
    const nfe = nfes[i];
    const detNodes = nfe.getElementsByTagName('det');
    
    // Acumuladores dos itens
    let sumVProd = 0;
    let sumVFrete = 0;
    let sumVSeg = 0;
    let sumVDesc = 0;
    let sumVOutro = 0;
    let sumIBSCBS_vBC = 0;

    for (let j = 0; j < detNodes.length; j++) {
      const det = detNodes[j];
      
      const prod = det.getElementsByTagName('prod')[0];
      if (prod) {
         sumVProd += getFloat(prod, 'vProd');
         sumVFrete += getFloat(prod, 'vFrete');
         sumVSeg += getFloat(prod, 'vSeg');
         sumVDesc += getFloat(prod, 'vDesc');
         sumVOutro += getFloat(prod, 'vOutro');
      }

      const ibscbs = det.getElementsByTagName('IBSCBS')[0];
      if (ibscbs) {
        const gIBSCBS = ibscbs.getElementsByTagName('gIBSCBS')[0];
        if (gIBSCBS) {
           sumIBSCBS_vBC += getFloat(gIBSCBS, 'vBC');
        }
      }
    }

    // Totais declarados
    const totalNode = nfe.getElementsByTagName('total')[0];
    if (totalNode) {
       const icmsTot = totalNode.getElementsByTagName('ICMSTot')[0];
       if (icmsTot) {
          const total_vProd = getFloat(icmsTot, 'vProd');
          if (total_vProd > 0 && Math.abs(total_vProd - sumVProd) > 0.01) {
             errors.push({
                ruleId: 'W03-VPROD',
                message: `O valor Total dos Produtos (vProd) no grupo de totais (${total_vProd.toFixed(2)}) difere do somatório de vProd dos itens (${sumVProd.toFixed(2)}).`,
                elementName: 'vProd',
                relatedPaths: ['prod/vProd', 'ICMSTot/vProd'],
                severity: 'error'
             });
          }

          const total_vFrete = getFloat(icmsTot, 'vFrete');
          if (total_vFrete > 0 && Math.abs(total_vFrete - sumVFrete) > 0.01) {
             errors.push({
                ruleId: 'W04-VFRETE',
                message: `O valor do Frete (${total_vFrete.toFixed(2)}) difere do somatório de vFrete dos itens (${sumVFrete.toFixed(2)}).`,
                elementName: 'vFrete',
                relatedPaths: ['prod/vFrete', 'ICMSTot/vFrete'],
                severity: 'error'
             });
          }

          const total_vSeg = getFloat(icmsTot, 'vSeg');
          if (total_vSeg > 0 && Math.abs(total_vSeg - sumVSeg) > 0.01) {
             errors.push({
                ruleId: 'W05-VSEG',
                message: `O valor do Seguro (${total_vSeg.toFixed(2)}) difere do somatório de vSeg dos itens (${sumVSeg.toFixed(2)}).`,
                elementName: 'vSeg',
                relatedPaths: ['prod/vSeg', 'ICMSTot/vSeg'],
                severity: 'error'
             });
          }

          const total_vDesc = getFloat(icmsTot, 'vDesc');
          if (total_vDesc > 0 && Math.abs(total_vDesc - sumVDesc) > 0.01) {
             errors.push({
                ruleId: 'W06-VDESC',
                message: `O valor do Desconto (${total_vDesc.toFixed(2)}) difere do somatório de vDesc dos itens (${sumVDesc.toFixed(2)}).`,
                elementName: 'vDesc',
                relatedPaths: ['prod/vDesc', 'ICMSTot/vDesc'],
                severity: 'error'
             });
          }

          const total_vOutro = getFloat(icmsTot, 'vOutro');
          if (total_vOutro > 0 && Math.abs(total_vOutro - sumVOutro) > 0.01) {
             errors.push({
                ruleId: 'W11-VOUTRO',
                message: `O valor de Outras Despesas (${total_vOutro.toFixed(2)}) difere do somatório de vOutro dos itens (${sumVOutro.toFixed(2)}).`,
                elementName: 'vOutro',
                relatedPaths: ['prod/vOutro', 'ICMSTot/vOutro'],
                severity: 'error'
             });
          }

          // W16 - Validação do Total da Nota (vNF)
          const total_vNF = getFloat(icmsTot, 'vNF');
          
          const vICMSDeson = getFloat(icmsTot, 'vICMSDeson');
          const vST = getFloat(icmsTot, 'vST');
          const vFCPST = getFloat(icmsTot, 'vFCPST');
          const vII = getFloat(icmsTot, 'vII');
          const vIPI = getFloat(icmsTot, 'vIPI');
          const vIPIDevol = getFloat(icmsTot, 'vIPIDevol');
          const vServ = getFloat(icmsTot, 'vServ');
          
          // Formula SEFAZ: vProd - vDesc - vICMSDeson + vST + vFCPST + vFrete + vSeg + vOutro + vII + vIPI + vIPIDevol + vServ
          const calculated_vNF = sumVProd - sumVDesc - vICMSDeson + vST + vFCPST + sumVFrete + sumVSeg + sumVOutro + vII + vIPI + vIPIDevol + vServ;
          
          if (total_vNF > 0 && Math.abs(total_vNF - calculated_vNF) > 0.01) {
             errors.push({
                ruleId: 'W16-VNF',
                message: `O valor Total da NF-e (vNF = ${total_vNF.toFixed(2)}) não bate com a fórmula da SEFAZ (${calculated_vNF.toFixed(2)}).`,
                elementName: 'vNF',
                relatedPaths: ['ICMSTot/vNF'],
                severity: 'error'
             });
          }
       }

       const ibsCbsTot = totalNode.getElementsByTagName('IBSCBSTot')[0];
       if (ibsCbsTot) {
          const total_vBCIBSCBS = getFloat(ibsCbsTot, 'vBCIBSCBS');
          if (total_vBCIBSCBS > 0 && Math.abs(total_vBCIBSCBS - sumIBSCBS_vBC) > 0.01) {
             errors.push({
                ruleId: 'W03-IBSCBS',
                message: `O valor da Base de Cálculo do IBS/CBS do total da NF-e (${total_vBCIBSCBS.toFixed(2)}) difere do somatório da Base de Cálculo dos itens (${sumIBSCBS_vBC.toFixed(2)}).`,
                elementName: 'vBCIBSCBS',
                relatedPaths: ['IBSCBSTot/vBCIBSCBS', 'gIBSCBS/vBC'],
                severity: 'error'
             });
          }
       }
    }
  }
  
  return errors;
}
