import JSZip from 'jszip';
import type {
  ApiCollection,
  ApiRequestItem,
  ApiEnvironment,
  BodyType,
  AuthType
} from './apiTester';

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

function getBrunoBodyMode(type?: BodyType): string {
  switch (type) {
    case 'json':
      return 'json';
    case 'xml':
      return 'xml';
    case 'raw':
      return 'text';
    case 'urlencoded':
      return 'form-urlencoded';
    case 'form-data':
      return 'multipart-form';
    default:
      return 'none';
  }
}

function getBrunoAuthMode(type?: AuthType): string {
  switch (type) {
    case 'bearer':
      return 'bearer';
    case 'basic':
      return 'basic';
    case 'apikey':
      return 'apikey';
    default:
      return 'none';
  }
}

function indentLines(text: string, spaces = 2): string {
  const pad = ' '.repeat(spaces);
  return text
    .split(/\r?\n/)
    .map((l) => (l.trim() ? pad + l : ''))
    .join('\n');
}

/**
 * Converte um item de requisição para o formato textual .bru do Bruno.
 */
export function serializeRequestToBru(req: ApiRequestItem, seq = 1): string {
  const blocks: string[] = [];

  // Bloco meta
  blocks.push(`meta {\n  name: ${req.name || 'Nova Requisição'}\n  type: http\n  seq: ${seq}\n}`);

  // Bloco do método HTTP
  const methodLower = (req.method || 'GET').toLowerCase();
  const bodyMode = getBrunoBodyMode(req.bodyType);
  const authMode = getBrunoAuthMode(req.auth?.type);
  blocks.push(`${methodLower} {\n  url: ${req.url || ''}\n  body: ${bodyMode}\n  auth: ${authMode}\n}`);

  // Bloco params:query
  if (req.params && req.params.length > 0) {
    const valid = req.params.filter((p) => p.key && p.key.trim().length > 0);
    if (valid.length > 0) {
      const lines = valid.map((p) => `  ${p.enabled ? '' : '~'}${p.key.trim()}: ${p.value ?? ''}`);
      blocks.push(`params:query {\n${lines.join('\n')}\n}`);
    }
  }

  // Bloco headers
  if (req.headers && req.headers.length > 0) {
    const valid = req.headers.filter((h) => h.key && h.key.trim().length > 0);
    if (valid.length > 0) {
      const lines = valid.map((h) => `  ${h.enabled ? '' : '~'}${h.key.trim()}: ${h.value ?? ''}`);
      blocks.push(`headers {\n${lines.join('\n')}\n}`);
    }
  }

  // Bloco auth
  if (req.auth) {
    if (req.auth.type === 'bearer' && req.auth.bearerToken) {
      blocks.push(`auth:bearer {\n  token: ${req.auth.bearerToken}\n}`);
    } else if (req.auth.type === 'basic') {
      blocks.push(
        `auth:basic {\n  username: ${req.auth.basicUser || ''}\n  password: ${req.auth.basicPass || ''}\n}`
      );
    } else if (req.auth.type === 'apikey') {
      blocks.push(
        `auth:apikey {\n  key: ${req.auth.apiKeyName || ''}\n  value: ${req.auth.apiKeyValue || ''}\n  placement: ${
          req.auth.apiKeyLocation || 'header'
        }\n}`
      );
    }
  }

  // Bloco body
  if (req.bodyType === 'json' && req.bodyContent?.trim()) {
    blocks.push(`body:json {\n${indentLines(req.bodyContent.trim(), 2)}\n}`);
  } else if (req.bodyType === 'xml' && req.bodyContent?.trim()) {
    blocks.push(`body:xml {\n${indentLines(req.bodyContent.trim(), 2)}\n}`);
  } else if (req.bodyType === 'raw' && req.bodyContent?.trim()) {
    blocks.push(`body:text {\n${indentLines(req.bodyContent.trim(), 2)}\n}`);
  } else if (req.bodyType === 'urlencoded' && req.bodyUrlEncoded && req.bodyUrlEncoded.length > 0) {
    const valid = req.bodyUrlEncoded.filter((p) => p.key && p.key.trim().length > 0);
    if (valid.length > 0) {
      const lines = valid.map((p) => `  ${p.enabled ? '' : '~'}${p.key.trim()}: ${p.value ?? ''}`);
      blocks.push(`body:form-urlencoded {\n${lines.join('\n')}\n}`);
    }
  } else if (req.bodyType === 'form-data' && req.bodyFormData && req.bodyFormData.length > 0) {
    const valid = req.bodyFormData.filter((p) => p.key && p.key.trim().length > 0);
    if (valid.length > 0) {
      const lines = valid.map((p) => `  ${p.enabled ? '' : '~'}${p.key.trim()}: ${p.value ?? ''}`);
      blocks.push(`body:multipart-form {\n${lines.join('\n')}\n}`);
    }
  }

  return blocks.join('\n\n') + '\n';
}

/**
 * Converte um ambiente para arquivo .bru de ambiente do Bruno.
 */
export function serializeEnvToBru(env: ApiEnvironment): string {
  if (!env.variables || env.variables.length === 0) {
    return 'vars {\n}\n';
  }
  const lines = env.variables
    .filter((v) => v.key && v.key.trim().length > 0)
    .map((v) => `  ${v.enabled ? '' : '~'}${v.key.trim()}: ${v.value ?? ''}`);
  return `vars {\n${lines.join('\n')}\n}\n`;
}

/**
 * Cria o conteúdo do descritor de coleção bruno.json.
 */
export function createBrunoCollectionJson(name: string): string {
  return JSON.stringify(
    {
      version: '1',
      name: name.trim() || 'Coleção Bruno',
      type: 'collection',
      ignore: ['node_modules', '.git']
    },
    null,
    2
  );
}

/**
 * Gera um arquivo ZIP contendo uma ou mais coleções no formato nativo do Bruno.
 * Se houver apenas 1 coleção, o ZIP contém a raiz com bruno.json e as subpastas.
 * Se houver múltiplas coleções, cada coleção é colocada em sua respectiva pasta raiz.
 */
export async function generateBrunoZip(
  collections: ApiCollection[],
  environments: ApiEnvironment[] = []
): Promise<Blob> {
  const zip = new JSZip();
  const isSingleCol = collections.length === 1;

  collections.forEach((col) => {
    // Para 1 coleção, coloca arquivos na raiz do zip. Para múltiplas, cria uma pasta por coleção.
    const colRoot = isSingleCol ? zip : zip.folder(sanitizeFileName(col.name) || 'Colecao');
    if (!colRoot) return;

    // bruno.json
    colRoot.file('bruno.json', createBrunoCollectionJson(col.name));

    // Garante criação de subpastas vazias declaradas em col.folders
    if (col.folders && col.folders.length > 0) {
      col.folders.forEach((fPath) => {
        const clean = fPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (clean) {
          const parts = clean.split('/');
          const folderName = parts[parts.length - 1];
          colRoot.file(`${clean}/folder.bru`, `meta {\n  name: ${folderName}\n}\n`);
        }
      });
    }

    // Grava as requisições
    let seq = 1;
    col.requests.forEach((req) => {
      const bruText = serializeRequestToBru(req, seq++);
      const safeName = sanitizeFileName(req.name) || `requisicao_${seq}`;
      const fileName = `${safeName}.bru`;

      if (req.folder) {
        const cleanFolder = req.folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        colRoot.file(`${cleanFolder}/${fileName}`, bruText);
      } else {
        colRoot.file(fileName, bruText);
      }
    });

    // Ambientes na pasta environments/
    if (environments && environments.length > 0) {
      const envDir = colRoot.folder('environments');
      if (envDir) {
        environments.forEach((env) => {
          const safeEnvName = sanitizeFileName(env.name) || 'Ambiente';
          envDir.file(`${safeEnvName}.bru`, serializeEnvToBru(env));
        });
      }
    }
  });

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
