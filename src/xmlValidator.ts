import { validateXML, type XMLFileInfo, type XMLValidationError } from 'xmllint-wasm';

export interface SchemaOption {
  id: string;
  name: string;
  rootElement: string;
  mainXsd: string;
}

export interface SchemaPackage {
  id: string;
  categoryName: string;
  environmentName: string;
  basePath: string;
  mainSchemas: SchemaOption[];
  auxiliaryFiles: string[];
}

export interface ParsedValidationError {
  rawMessage: string;
  message: string;
  lineNumber: number | null;
  elementName?: string;
  friendlyExplanation?: string;
}

export interface FileValidationResult {
  fileName: string;
  valid: boolean;
  detectedSchemaId?: string;
  detectedSchemaName?: string;
  mainXsdUsed?: string;
  errors: ParsedValidationError[];
  rawXml: string;
}

// Registro de Schemas disponíveis
export const SCHEMA_PACKAGES: SchemaPackage[] = [
  {
    id: 'nfse_padrao_nacional_prod',
    categoryName: 'NFS-e Padrão Nacional',
    environmentName: 'Produção (v1.01 / v1.00)',
    basePath: './Schemas/Padrão nacional/Produção',
    mainSchemas: [
      { id: 'nfse', name: 'NFS-e (Nota Fiscal de Serviços Eletrônica)', rootElement: 'NFSe', mainXsd: 'NFSe_v1.01.xsd' },
      { id: 'dps', name: 'DPS (Declaração de Prestação de Serviços)', rootElement: 'DPS', mainXsd: 'DPS_v1.01.xsd' },
      { id: 'evento', name: 'Evento de NFS-e', rootElement: 'evento', mainXsd: 'evento_v1.01.xsd' },
      { id: 'pedRegEvento', name: 'Pedido de Registro de Evento', rootElement: 'pedRegEvento', mainXsd: 'pedRegEvento_v1.01.xsd' },
      { id: 'cnc', name: 'CNC (Cadastro Nacional de Contribuintes)', rootElement: 'CNC', mainXsd: 'CNC_v1.00.xsd' }
    ],
    auxiliaryFiles: [
      'tiposComplexos_v1.01.xsd',
      'tiposSimples_v1.01.xsd',
      'tiposEventos_v1.01.xsd',
      'tiposCnc_v1.00.xsd',
      'xmldsig-core-schema.xsd'
    ]
  },
  {
    id: 'nfse_padrao_nacional_homolog',
    categoryName: 'NFS-e Padrão Nacional',
    environmentName: 'Homologação (v1.01 / v1.00)',
    basePath: './Schemas/Padrão nacional/Homologação',
    mainSchemas: [
      { id: 'nfse', name: 'NFS-e (Nota Fiscal de Serviços Eletrônica)', rootElement: 'NFSe', mainXsd: 'NFSe_v1.01.xsd' },
      { id: 'dps', name: 'DPS (Declaração de Prestação de Serviços)', rootElement: 'DPS', mainXsd: 'DPS_v1.01.xsd' },
      { id: 'evento', name: 'Evento de NFS-e', rootElement: 'evento', mainXsd: 'evento_v1.01.xsd' },
      { id: 'pedRegEvento', name: 'Pedido de Registro de Evento', rootElement: 'pedRegEvento', mainXsd: 'pedRegEvento_v1.01.xsd' },
      { id: 'cnc', name: 'CNC (Cadastro Nacional de Contribuintes)', rootElement: 'CNC', mainXsd: 'CNC_v1.00.xsd' }
    ],
    auxiliaryFiles: [
      'tiposComplexos_v1.01.xsd',
      'tiposSimples_v1.01.xsd',
      'tiposEventos_v1.01.xsd',
      'tiposCnc_v1.00.xsd',
      'xmldsig-core-schema.xsd'
    ]
  },
  {
    id: 'nfse_sp_v02',
    categoryName: 'São Paulo - SP (Prefeitura)',
    environmentName: 'Produção / Homologação (v02)',
    basePath: './Schemas/São Paulo - SP',
    mainSchemas: [
      { id: 'pedidoEnvioRPS', name: 'Pedido Envio RPS (Individual)', rootElement: 'PedidoEnvioRPS', mainXsd: 'PedidoEnvioRPS_v02.xsd' },
      { id: 'pedidoEnvioLoteRPS', name: 'Pedido Envio Lote RPS', rootElement: 'PedidoEnvioLoteRPS', mainXsd: 'PedidoEnvioLoteRPS_v02.xsd' },
      { id: 'pedidoEnvioLoteRPSAsync', name: 'Pedido Envio Lote RPS (Assíncrono)', rootElement: 'PedidoEnvioLoteRPSAsync', mainXsd: 'PedidoEnvioLoteRPSAsync_v02.xsd' },
      { id: 'pedidoCancelamentoNFe', name: 'Pedido Cancelamento NFS-e', rootElement: 'PedidoCancelamentoNFe', mainXsd: 'PedidoCancelamentoNFe_v02.xsd' },
      { id: 'pedidoCancelamentoLote', name: 'Pedido Cancelamento Lote', rootElement: 'PedidoCancelamentoLote', mainXsd: 'PedidoCancelamentoLote_v02.xsd' },
      { id: 'pedidoConsultaNFe', name: 'Pedido Consulta NFS-e', rootElement: 'PedidoConsultaNFe', mainXsd: 'PedidoConsultaNFe_v02.xsd' },
      { id: 'pedidoConsultaNFePeriodo', name: 'Pedido Consulta NFS-e por Período', rootElement: 'PedidoConsultaNFePeriodo', mainXsd: 'PedidoConsultaNFePeriodo_v02.xsd' },
      { id: 'pedidoConsultaLote', name: 'Pedido Consulta Lote', rootElement: 'PedidoConsultaLote', mainXsd: 'PedidoConsultaLote_v02.xsd' },
      { id: 'pedidoConsultaCNPJ', name: 'Pedido Consulta CNPJ', rootElement: 'PedidoConsultaCNPJ', mainXsd: 'PedidoConsultaCNPJ_v02.xsd' },
      { id: 'pedidoInformacoesLote', name: 'Pedido Informações Lote', rootElement: 'PedidoInformacoesLote', mainXsd: 'PedidoInformacoesLote_v02.xsd' },
      { id: 'retornoEnvioRPS', name: 'Retorno Envio RPS', rootElement: 'RetornoEnvioRPS', mainXsd: 'RetornoEnvioRPS_v02.xsd' },
      { id: 'retornoEnvioLoteRPS', name: 'Retorno Envio Lote RPS', rootElement: 'RetornoEnvioLoteRPS', mainXsd: 'RetornoEnvioLoteRPS_v02.xsd' },
      { id: 'retornoCancelamentoNFe', name: 'Retorno Cancelamento NFS-e', rootElement: 'RetornoCancelamentoNFe', mainXsd: 'RetornoCancelamentoNFe_v02.xsd' },
      { id: 'retornoConsulta', name: 'Retorno Consulta', rootElement: 'RetornoConsulta', mainXsd: 'RetornoConsulta_v02.xsd' },
      { id: 'retornoConsultaCNPJ', name: 'Retorno Consulta CNPJ', rootElement: 'RetornoConsultaCNPJ', mainXsd: 'RetornoConsultaCNPJ_v02.xsd' }
    ],
    auxiliaryFiles: [
      'TiposNFe_v02.xsd',
      'TiposNFeAsync_v02.xsd',
      'xmldsig-core-schema_v02.xsd',
      'ConsultaGuia_v02.xsd',
      'ConsultaSituacaoGuiaAsync_v02.xsd',
      'ConsultaSituacaoLoteAsync_v02.xsd',
      'EmissaoGuiaAsync_v02.xsd',
      'RetornoEnvioLoteRPSAsync_v02.xsd',
      'RetornoInformacoesLote_v02.xsd'
    ]
  },
  {
    id: 'nfe_sefaz_v400',
    categoryName: 'NF-e (SEFAZ - Modelo 55/65)',
    environmentName: 'Produção / Homologação (v4.00)',
    basePath: './Schemas/SEFAZ NF-e/Produção',
    mainSchemas: [
      { id: 'nfeProc', name: 'NF-e Processada com Protocolo (nfeProc)', rootElement: 'nfeProc', mainXsd: 'procNFe_v4.00.xsd' },
      { id: 'nfe', name: 'NF-e (Nota Fiscal Eletrônica - NFe)', rootElement: 'NFe', mainXsd: 'nfe_v4.00.xsd' }
    ],
    auxiliaryFiles: [
      'leiauteNFe_v4.00.xsd',
      'DFeTiposBasicos_v1.00.xsd',
      'tiposBasico_v1.03.xsd',
      'tiposBasico_v4.00.xsd',
      'xmldsig-core-schema_v1.01.xsd',
      'e110001_v1.00.xsd',
      'e112110_v1.00.xsd',
      'e112120_v1.00 .xsd',
      'e112130_v1.00.xsd',
      'e112140_v1.00.xsd',
      'e112150_v1.00.xsd',
      'e211110_v1.00.xsd',
      'e211124_v1.00.xsd',
      'e211128_v1.00.xsd',
      'e211130_v1.00.xsd',
      'e211140_v1.00.xsd',
      'e211150_v1.00.xsd',
      'e212110_v1.00.xsd',
      'e212120_v1.00.xsd',
      'e412120_v1.00.xsd',
      'e412130_v1.00.xsd'
    ]
  },
  {
    id: 'nfse_guarulhos_v204',
    categoryName: 'Guarulhos - SP (Prefeitura / ABRASF)',
    environmentName: 'Produção / Homologação (v2.04)',
    basePath: './Schemas/Guarulhos - SP',
    mainSchemas: [
      { id: 'gerarNfseEnvio', name: 'Gerar NFS-e (GerarNfseEnvio)', rootElement: 'GerarNfseEnvio', mainXsd: 'gerar-nfse-envio-v2_04.xsd' },
      { id: 'enviarLoteRpsEnvio', name: 'Enviar Lote RPS Assíncrono (EnviarLoteRpsEnvio)', rootElement: 'EnviarLoteRpsEnvio', mainXsd: 'enviar-lote-rps-envio-v2_04.xsd' },
      { id: 'enviarLoteRpsSincronoEnvio', name: 'Enviar Lote RPS Síncrono (EnviarLoteRpsSincronoEnvio)', rootElement: 'EnviarLoteRpsSincronoEnvio', mainXsd: 'enviar-lote-rps-sincrono-envio-v2_04.xsd' },
      { id: 'cancelarNfseEnvio', name: 'Cancelar NFS-e (CancelarNfseEnvio)', rootElement: 'CancelarNfseEnvio', mainXsd: 'cancelar-nfse-envio-v2_04.xsd' },
      { id: 'substituirNfseEnvio', name: 'Substituir NFS-e (SubstituirNfseEnvio)', rootElement: 'SubstituirNfseEnvio', mainXsd: 'substituir-nfse-envio-v2_04.xsd' },
      { id: 'consultarLoteRpsEnvio', name: 'Consultar Lote RPS (ConsultarLoteRpsEnvio)', rootElement: 'ConsultarLoteRpsEnvio', mainXsd: 'consultar-lote-rps-envio-v2_04.xsd' },
      { id: 'consultarNfseRpsEnvio', name: 'Consultar NFS-e por RPS (ConsultarNfseRpsEnvio)', rootElement: 'ConsultarNfseRpsEnvio', mainXsd: 'consultar-nfse-rps-envio-v2_04.xsd' },
      { id: 'consultarNfseFaixaEnvio', name: 'Consultar NFS-e por Faixa (ConsultarNfseFaixaEnvio)', rootElement: 'ConsultarNfseFaixaEnvio', mainXsd: 'consultar-nfse-faixa-envio-v2_04.xsd' },
      { id: 'consultarNfseServicoPrestadoEnvio', name: 'Consultar Serviços Prestados', rootElement: 'ConsultarNfseServicoPrestadoEnvio', mainXsd: 'consultar-nfse-servico-prestado-envio-v2_04.xsd' },
      { id: 'consultarNfseServicoTomadoEnvio', name: 'Consultar Serviços Tomados', rootElement: 'ConsultarNfseServicoTomadoEnvio', mainXsd: 'consultar-nfse-servico-tomado-envio-v2_04.xsd' },
      { id: 'compNfse', name: 'NFS-e Compilada (CompNfse)', rootElement: 'CompNfse', mainXsd: 'nfse_v2-04.xsd' }
    ],
    auxiliaryFiles: [
      'tipos-v2_04.xsd',
      'cabecalho-v2_04.xsd',
      'xmldsig-core-schema20020212.xsd',
      'gerar-nfse-resposta-v2_04.xsd',
      'enviar-lote-rps-resposta-v2_04.xsd',
      'enviar-lote-rps-sincrono-resposta-v2_04.xsd',
      'cancelar-nfse-reposta-v2_04.xsd',
      'substituir-nfse-resposta-v2_04.xsd',
      'consultar-lote-rps-resposta-v2_04.xsd',
      'consultar-nfse-rps-resposta-v2_04.xsd',
      'consultar-nfse-faixa-resposta-v2_04.xsd',
      'consultar-nfse-servico-prestado-resposta-v2_04.xsd',
      'consultar-nfse-servico-tomado-resposta-v2_04.xsd'
    ]
  }
];

// Cache em memória dos arquivos XSD baixados
const schemaContentCache = new Map<string, string>();

/**
 * Carrega o conteúdo de um arquivo XSD via fetch com suporte a caminhos relativos
 */
async function loadSchemaFile(basePath: string, fileName: string): Promise<string> {
  const cacheKey = `${basePath}/${fileName}`;
  if (schemaContentCache.has(cacheKey)) {
    return schemaContentCache.get(cacheKey)!;
  }

  const url = `${basePath}/${fileName}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Não foi possível carregar o arquivo de schema XSD: ${fileName} (${response.statusText})`);
  }

  const content = await response.text();
  schemaContentCache.set(cacheKey, content);
  return content;
}

/**
 * Detecta a tag raiz de um documento XML
 */
export function detectXmlRootElement(xmlString: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    
    // Verifica se houve erro de parse
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      // Tenta fallback com regex simples na tag inicial
      const match = xmlString.match(/<([a-zA-Z0-9_\-\:]+)(\s|>)/);
      if (match) {
        const fullTag = match[1];
        return fullTag.includes(':') ? fullTag.split(':')[1] : fullTag;
      }
      return null;
    }

    return doc.documentElement ? doc.documentElement.localName : null;
  } catch (err) {
    const match = xmlString.match(/<([a-zA-Z0-9_\-\:]+)(\s|>)/);
    if (match) {
      const fullTag = match[1];
      return fullTag.includes(':') ? fullTag.split(':')[1] : fullTag;
    }
    return null;
  }
}

/**
 * Traduz e simplifica mensagens técnicas de erro do libxml2 para português claro
 */
function translateErrorMessage(rawMessage: string): { friendlyExplanation: string; elementName?: string } {
  let friendlyExplanation = rawMessage;
  let elementName: string | undefined = undefined;

  // Extrai nome de elemento se houver: Element '{namespace}ElementName': ...
  const elementMatch = rawMessage.match(/Element\s+'(?:\{[^}]+\})?([^']+)'/i);
  if (elementMatch) {
    elementName = elementMatch[1];
  }

  if (rawMessage.includes('This element is not expected')) {
    const expectedMatch = rawMessage.match(/Expected is\s+(.*?)\./);
    const expected = expectedMatch ? ` Esperado: ${expectedMatch[1]}` : '';
    friendlyExplanation = `O elemento ${elementName ? `'<${elementName}>'` : ''} não é permitido nesta posição.${expected}`;
  } else if (rawMessage.includes('Missing child element(s)')) {
    const expectedMatch = rawMessage.match(/Expected is\s+(.*?)\./);
    const expected = expectedMatch ? ` Faltando: ${expectedMatch[1]}` : '';
    friendlyExplanation = `O elemento ${elementName ? `'<${elementName}>'` : ''} está incompleto ou faltam campos obrigatórios.${expected}`;
  } else if (rawMessage.includes('[facet \'pattern\']')) {
    const valueMatch = rawMessage.match(/The value '([^']+)'/);
    const val = valueMatch ? `'${valueMatch[1]}'` : 'fornecido';
    friendlyExplanation = `O valor ${val} no campo ${elementName ? `'<${elementName}>'` : ''} não atende ao formato/máscara exigido pelo schema.`;
  } else if (rawMessage.includes('[facet \'maxLength\']') || rawMessage.includes('[facet \'minLength\']') || rawMessage.includes('[facet \'length\']')) {
    friendlyExplanation = `O tamanho do texto informado no campo ${elementName ? `'<${elementName}>'` : ''} está fora do limite permitido pelo schema.`;
  } else if (rawMessage.includes('[facet \'enumeration\']')) {
    const valueMatch = rawMessage.match(/The value '([^']+)'/);
    const val = valueMatch ? `'${valueMatch[1]}'` : 'fornecido';
    friendlyExplanation = `O valor ${val} no campo ${elementName ? `'<${elementName}>'` : ''} não é uma opção válida da lista de valores aceitos.`;
  } else if (rawMessage.includes('is not a valid value of the atomic type') || rawMessage.includes('is not a valid value of the list type')) {
    friendlyExplanation = `O tipo de dado informado no campo ${elementName ? `'<${elementName}>'` : ''} é inválido (ex: letra em campo numérico ou data malformada).`;
  } else if (rawMessage.includes('Premature end of data') || rawMessage.includes('Syntax error') || rawMessage.includes('Unclosed tag')) {
    friendlyExplanation = `Estrutura XML malformada. Verifique se todas as tags foram fechadas corretamente.`;
  }

  return { friendlyExplanation, elementName };
}

/**
 * Valida um conteúdo XML contra um pacote de schemas XSD
 */
export async function validateSingleXml(
  xmlContent: string,
  fileName: string,
  packageId: string = 'nfse_padrao_nacional_prod',
  forcedSchemaId: string = 'auto'
): Promise<FileValidationResult> {
  const schemaPkg = SCHEMA_PACKAGES.find(p => p.id === packageId) || SCHEMA_PACKAGES[0];
  
  // 1. Determina qual o schema principal
  let targetSchema: SchemaOption | undefined;
  const rootTag = detectXmlRootElement(xmlContent);

  if (forcedSchemaId !== 'auto') {
    targetSchema = schemaPkg.mainSchemas.find(s => s.id === forcedSchemaId);
  } else if (rootTag) {
    targetSchema = schemaPkg.mainSchemas.find(s => s.rootElement.toLowerCase() === rootTag.toLowerCase());
  }

  // Se ainda não encontrou, usa o primeiro como fallback
  if (!targetSchema) {
    targetSchema = schemaPkg.mainSchemas[0];
  }

  try {
    // 2. Carrega o schema principal e os auxiliares em paralelo
    const mainXsdContent = await loadSchemaFile(schemaPkg.basePath, targetSchema.mainXsd);
    
    // Todos os outros arquivos do pacote que não sejam o mainXsd
    const allPackageFiles = [
      ...schemaPkg.mainSchemas.map(s => s.mainXsd),
      ...schemaPkg.auxiliaryFiles
    ];
    const preloadFilesList = Array.from(new Set(allPackageFiles)).filter(f => f !== targetSchema!.mainXsd);

    const preloadFiles: XMLFileInfo[] = await Promise.all(
      preloadFilesList.map(async (fName) => {
        const content = await loadSchemaFile(schemaPkg.basePath, fName);
        return {
          fileName: fName,
          contents: content
        };
      })
    );

    // 3. Executa a validação usando xmllint-wasm
    const result = await validateXML({
      xml: [
        {
          fileName: fileName,
          contents: xmlContent
        }
      ],
      schema: [
        {
          fileName: targetSchema.mainXsd,
          contents: mainXsdContent
        }
      ],
      preload: preloadFiles
    });

    // 4. Mapeia e formata os erros
    const parsedErrors: ParsedValidationError[] = (result.errors || []).map((err: XMLValidationError) => {
      const { friendlyExplanation, elementName } = translateErrorMessage(err.message || err.rawMessage);
      return {
        rawMessage: err.rawMessage || err.message,
        message: err.message || err.rawMessage,
        lineNumber: err.loc ? err.loc.lineNumber : null,
        elementName,
        friendlyExplanation
      };
    });

    return {
      fileName,
      valid: result.valid,
      detectedSchemaId: targetSchema.id,
      detectedSchemaName: targetSchema.name,
      mainXsdUsed: targetSchema.mainXsd,
      errors: parsedErrors,
      rawXml: xmlContent
    };

  } catch (err: any) {
    return {
      fileName,
      valid: false,
      detectedSchemaId: targetSchema?.id,
      detectedSchemaName: targetSchema?.name,
      mainXsdUsed: targetSchema?.mainXsd,
      errors: [
        {
          rawMessage: err?.message || String(err),
          message: err?.message || 'Erro durante a inicialização do validador XSD.',
          lineNumber: null,
          friendlyExplanation: `Falha ao carregar ou processar o esquema XSD (${targetSchema?.mainXsd}): ${err?.message || err}`
        }
      ],
      rawXml: xmlContent
    };
  }
}

/**
 * Valida múltiplos arquivos XML em lote
 */
export async function validateBatchXml(
  files: { name: string; content: string }[],
  packageId: string = 'nfse_padrao_nacional_prod',
  forcedSchemaId: string = 'auto',
  onProgress?: (processed: number, total: number) => void
): Promise<FileValidationResult[]> {
  const results: FileValidationResult[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const res = await validateSingleXml(file.content, file.name, packageId, forcedSchemaId);
    results.push(res);
    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
  return results;
}
