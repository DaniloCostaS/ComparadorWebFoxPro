import { load } from 'js-yaml';
import type {
  ApiCollection,
  ApiRequestItem,
  ApiEnvironment,
  EnvironmentVariable,
  KeyValueParam,
  HttpMethod,
  BodyType,
  ApiAuth
} from './apiTester';

export interface BrunoImportResult {
  collections: ApiCollection[];
  environments: ApiEnvironment[];
  totalRequests: number;
}

export interface RawFileEntry {
  path: string;
  content: string;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// --- Parser de Blocos Sintáticos do Bruno (.bru) ---
export function parseBruBlocks(content: string): { type: string; content: string }[] {
  const blocks: { type: string; content: string }[] = [];
  const lines = content.split(/\r?\n/);
  let currentBlock: string | null = null;
  let blockLines: string[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (currentBlock === null) {
      const match = line.match(/^([a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)?)\s*\{\s*$/);
      if (match) {
        currentBlock = match[1];
        blockLines = [];
        braceDepth = 1;
      }
    } else {
      for (const char of line) {
        if (char === '{') braceDepth++;
        else if (char === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        blocks.push({ type: currentBlock, content: blockLines.join('\n') });
        currentBlock = null;
        braceDepth = 0;
      } else {
        blockLines.push(line);
      }
    }
  }

  return blocks;
}

// --- Parser de Requisição Individual .bru ---
export function parseBruRequest(text: string, defaultName: string): ApiRequestItem | null {
  const blocks = parseBruBlocks(text);
  if (blocks.length === 0) return null;

  const blockMap = new Map<string, string>();
  for (const b of blocks) {
    blockMap.set(b.type, b.content);
  }

  const httpMethods: string[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
  let foundMethod: string | null = null;
  let methodContent = '';

  for (const m of httpMethods) {
    if (blockMap.has(m)) {
      foundMethod = m;
      methodContent = blockMap.get(m)!;
      break;
    }
  }

  // Se não tem bloco de método HTTP, é apenas metadata de pasta/coleção (ex: folder.bru, collection.bru)
  if (!foundMethod) return null;

  const method = foundMethod.toUpperCase() as HttpMethod;

  // Nome da requisição
  let name = defaultName;
  if (blockMap.has('meta')) {
    const metaContent = blockMap.get('meta')!;
    const nameMatch = metaContent.match(/name:\s*(.+)/);
    if (nameMatch && nameMatch[1].trim()) {
      name = nameMatch[1].trim();
    }
  }

  // URL e Body Mode no bloco de método
  let url = '';
  let bodyType: BodyType = 'none';

  const urlMatch = methodContent.match(/url:\s*(.+)/);
  if (urlMatch) {
    url = urlMatch[1].trim();
  }

  const bodyMatch = methodContent.match(/body:\s*(.+)/);
  if (bodyMatch) {
    const b = bodyMatch[1].trim().toLowerCase();
    if (b === 'json') bodyType = 'json';
    else if (b === 'xml') bodyType = 'xml';
    else if (b === 'text') bodyType = 'raw';
    else if (b === 'formurlencoded' || b === 'form-urlencoded') bodyType = 'urlencoded';
    else if (b === 'multipartform' || b === 'multipart-form') bodyType = 'form-data';
    else bodyType = 'none';
  }

  // Headers
  const headers: KeyValueParam[] = [];
  if (blockMap.has('headers')) {
    const lines = blockMap.get('headers')!.split(/\r?\n/);
    for (const l of lines) {
      const idx = l.indexOf(':');
      if (idx > 0) {
        let k = l.slice(0, idx).trim();
        const v = l.slice(idx + 1).trim();
        let enabled = true;
        if (k.startsWith('~')) {
          enabled = false;
          k = k.slice(1).trim();
        }
        if (k) {
          headers.push({ id: uid(), key: k, value: v, enabled });
        }
      }
    }
  }

  // Query Params
  const params: KeyValueParam[] = [];
  if (blockMap.has('params:query')) {
    const lines = blockMap.get('params:query')!.split(/\r?\n/);
    for (const l of lines) {
      const idx = l.indexOf(':');
      if (idx > 0) {
        let k = l.slice(0, idx).trim();
        const v = l.slice(idx + 1).trim();
        let enabled = true;
        if (k.startsWith('~')) {
          enabled = false;
          k = k.slice(1).trim();
        }
        if (k) {
          params.push({ id: uid(), key: k, value: v, enabled });
        }
      }
    }
  }

  // Auth
  const auth: ApiAuth = { type: 'none' };
  if (blockMap.has('auth:bearer')) {
    auth.type = 'bearer';
    const m = blockMap.get('auth:bearer')!.match(/token:\s*(.+)/);
    if (m) auth.bearerToken = m[1].trim();
  } else if (blockMap.has('auth:basic')) {
    auth.type = 'basic';
    const u = blockMap.get('auth:basic')!.match(/username:\s*(.+)/);
    const p = blockMap.get('auth:basic')!.match(/password:\s*(.+)/);
    if (u) auth.basicUser = u[1].trim();
    if (p) auth.basicPass = p[1].trim();
  } else if (blockMap.has('auth:apikey')) {
    auth.type = 'apikey';
    const c = blockMap.get('auth:apikey')!;
    const k = c.match(/key:\s*(.+)/);
    const v = c.match(/value:\s*(.+)/);
    const pl = c.match(/placement:\s*(.+)/);
    if (k) auth.apiKeyName = k[1].trim();
    if (v) auth.apiKeyValue = v[1].trim();
    if (pl) auth.apiKeyLocation = pl[1].trim().toLowerCase() === 'query' ? 'query' : 'header';
  }

  // Body Content
  let bodyContent = '';
  const bodyFormData: KeyValueParam[] = [];
  const bodyUrlEncoded: KeyValueParam[] = [];

  if (blockMap.has('body:json')) {
    bodyContent = blockMap.get('body:json')!.trim();
    bodyType = 'json';
  } else if (blockMap.has('body:xml')) {
    bodyContent = blockMap.get('body:xml')!.trim();
    bodyType = 'xml';
  } else if (blockMap.has('body:text')) {
    bodyContent = blockMap.get('body:text')!.trim();
    bodyType = 'raw';
  } else if (blockMap.has('body:form-urlencoded')) {
    bodyType = 'urlencoded';
    const lines = blockMap.get('body:form-urlencoded')!.split(/\r?\n/);
    for (const l of lines) {
      const idx = l.indexOf(':');
      if (idx > 0) {
        let k = l.slice(0, idx).trim();
        const v = l.slice(idx + 1).trim();
        let enabled = true;
        if (k.startsWith('~')) {
          enabled = false;
          k = k.slice(1).trim();
        }
        if (k) bodyUrlEncoded.push({ id: uid(), key: k, value: v, enabled });
      }
    }
  } else if (blockMap.has('body:multipart-form')) {
    bodyType = 'form-data';
    const lines = blockMap.get('body:multipart-form')!.split(/\r?\n/);
    for (const l of lines) {
      const idx = l.indexOf(':');
      if (idx > 0) {
        let k = l.slice(0, idx).trim();
        const v = l.slice(idx + 1).trim();
        let enabled = true;
        if (k.startsWith('~')) {
          enabled = false;
          k = k.slice(1).trim();
        }
        if (k) bodyFormData.push({ id: uid(), key: k, value: v, enabled });
      }
    }
  }

  return {
    id: uid(),
    name,
    method,
    url,
    params,
    headers,
    auth,
    bodyType,
    bodyContent,
    bodyFormData,
    bodyUrlEncoded,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// --- Parser de Arquivo de Ambiente .bru ---
export function parseBruEnv(text: string, defaultName: string): ApiEnvironment | null {
  const blocks = parseBruBlocks(text);
  const varsBlock = blocks.find((b) => b.type === 'vars');
  if (!varsBlock) return null;

  const variables: EnvironmentVariable[] = [];
  const lines = varsBlock.content.split(/\r?\n/);
  for (const l of lines) {
    const idx = l.indexOf(':');
    if (idx > 0) {
      let k = l.slice(0, idx).trim();
      const v = l.slice(idx + 1).trim();
      let enabled = true;
      if (k.startsWith('~')) {
        enabled = false;
        k = k.slice(1).trim();
      }
      if (k) {
        variables.push({ key: k, value: v, enabled });
      }
    }
  }

  if (variables.length === 0) return null;

  return {
    id: uid(),
    name: defaultName,
    variables
  };
}

// --- Parser de Requisição Individual OpenCollection (.yml) ---
export function parseYmlRequest(text: string, defaultName: string): ApiRequestItem | null {
  let doc: any = null;
  try {
    doc = load(text);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object') return null;

  // Ignora se for descritor de coleção, pasta ou ambiente
  if (doc.opencollection || doc.info?.type === 'folder' || (doc.name && doc.variables)) {
    return null;
  }

  const info = doc.info || {};
  const http = doc.http || {};

  // Se não tem bloco http ou método, não é uma requisição
  if (!doc.http && !info.type) return null;

  const name = info.name || defaultName;
  const method = ((http.method as string) || 'GET').toUpperCase() as HttpMethod;
  const url = http.url || '';

  const headers: KeyValueParam[] = [];
  if (Array.isArray(http.headers)) {
    for (const h of http.headers) {
      const k = h.name || h.key || '';
      const v = h.value ?? '';
      const enabled = h.disabled !== true;
      if (k) headers.push({ id: uid(), key: String(k), value: String(v), enabled });
    }
  } else if (http.headers && typeof http.headers === 'object') {
    for (const [k, v] of Object.entries(http.headers)) {
      headers.push({ id: uid(), key: k, value: String(v ?? ''), enabled: true });
    }
  }

  const params: KeyValueParam[] = [];
  if (Array.isArray(http.params)) {
    for (const p of http.params) {
      const k = p.name || p.key || '';
      const v = p.value ?? '';
      const enabled = p.disabled !== true;
      if (k) params.push({ id: uid(), key: String(k), value: String(v), enabled });
    }
  } else if (http.params && typeof http.params === 'object') {
    for (const [k, v] of Object.entries(http.params)) {
      params.push({ id: uid(), key: k, value: String(v ?? ''), enabled: true });
    }
  }

  let bodyType: BodyType = 'none';
  let bodyContent = '';
  const bodyFormData: KeyValueParam[] = [];
  const bodyUrlEncoded: KeyValueParam[] = [];

  if (http.body) {
    const bt = String(http.body.type || '').toLowerCase();
    const data = http.body.data;

    if (bt === 'json') {
      bodyType = 'json';
      bodyContent = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data || '');
    } else if (bt === 'xml') {
      bodyType = 'xml';
      bodyContent = String(data || '');
    } else if (bt === 'text') {
      bodyType = 'raw';
      bodyContent = String(data || '');
    } else if (bt === 'form-urlencoded' || bt === 'formurlencoded') {
      bodyType = 'urlencoded';
      if (Array.isArray(data)) {
        for (const it of data) {
          const k = it.name || it.key || '';
          if (k) bodyUrlEncoded.push({ id: uid(), key: String(k), value: String(it.value ?? ''), enabled: it.disabled !== true });
        }
      } else if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
          bodyUrlEncoded.push({ id: uid(), key: k, value: String(v ?? ''), enabled: true });
        }
      }
    } else if (bt === 'multipart-form' || bt === 'multipartform') {
      bodyType = 'form-data';
      if (Array.isArray(data)) {
        for (const it of data) {
          const k = it.name || it.key || '';
          if (k) bodyFormData.push({ id: uid(), key: String(k), value: String(it.value ?? ''), enabled: it.disabled !== true });
        }
      } else if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
          bodyFormData.push({ id: uid(), key: k, value: String(v ?? ''), enabled: true });
        }
      }
    }
  }

  const auth: ApiAuth = { type: 'none' };
  if (http.auth && typeof http.auth === 'object') {
    if (http.auth.type === 'bearer' && http.auth.bearer?.token) {
      auth.type = 'bearer';
      auth.bearerToken = http.auth.bearer.token;
    } else if (http.auth.type === 'basic') {
      auth.type = 'basic';
      auth.basicUser = http.auth.basic?.username;
      auth.basicPass = http.auth.basic?.password;
    } else if (http.auth.type === 'apikey') {
      auth.type = 'apikey';
      auth.apiKeyName = http.auth.apikey?.key;
      auth.apiKeyValue = http.auth.apikey?.value;
      auth.apiKeyLocation = http.auth.apikey?.placement === 'query' ? 'query' : 'header';
    }
  }

  return {
    id: uid(),
    name,
    method,
    url,
    params,
    headers,
    auth,
    bodyType,
    bodyContent,
    bodyFormData,
    bodyUrlEncoded,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// --- Parser de Arquivo de Ambiente OpenCollection (.yml) ---
export function parseYmlEnv(text: string, defaultName: string): ApiEnvironment | null {
  let doc: any = null;
  try {
    doc = load(text);
  } catch {
    return null;
  }
  if (!doc || !Array.isArray(doc.variables)) return null;

  const name = doc.name || defaultName;
  const variables: EnvironmentVariable[] = [];

  for (const v of doc.variables) {
    const k = v.name || v.key || '';
    if (k) {
      variables.push({
        key: String(k),
        value: String(v.value ?? ''),
        enabled: true
      });
    }
  }

  if (variables.length === 0) return null;

  return {
    id: uid(),
    name,
    variables
  };
}

// --- Agrupador e Importador de Coleções a partir de Arquivos Brutos ---
export function importBrunoFromFiles(files: RawFileEntry[]): BrunoImportResult {
  // Normaliza caminhos com barras /
  const normalized = files.map((f) => ({
    path: f.path.replace(/\\/g, '/').replace(/^\/+/, ''),
    content: f.content
  }));

  // Passo 1: Localizar raízes de coleções (bruno.json ou opencollection.yml)
  interface ColRootInfo {
    dirPath: string; // Ex: "Azure Blob" ou "Bruno/VolpeWeb"
    name: string;
    type: 'bruno' | 'opencollection';
  }

  const colRoots: ColRootInfo[] = [];

  for (const file of normalized) {
    const parts = file.path.split('/');
    const fileName = parts[parts.length - 1];
    const dirPath = parts.slice(0, -1).join('/');

    if (fileName === 'bruno.json') {
      try {
        const data = JSON.parse(file.content);
        colRoots.push({
          dirPath,
          name: data.name || parts[parts.length - 2] || 'Coleção Bruno',
          type: 'bruno'
        });
      } catch {
        colRoots.push({
          dirPath,
          name: parts[parts.length - 2] || 'Coleção Bruno',
          type: 'bruno'
        });
      }
    } else if (fileName === 'opencollection.yml') {
      try {
        const doc: any = load(file.content);
        colRoots.push({
          dirPath,
          name: doc?.info?.name || parts[parts.length - 2] || 'Coleção OpenCollection',
          type: 'opencollection'
        });
      } catch {
        colRoots.push({
          dirPath,
          name: parts[parts.length - 2] || 'Coleção OpenCollection',
          type: 'opencollection'
        });
      }
    }
  }

  // Se nenhuma raiz formal foi encontrada, agrupa pelo primeiro diretório ou raiz
  if (colRoots.length === 0) {
    const dirSet = new Set<string>();
    for (const f of normalized) {
      const parts = f.path.split('/');
      if (parts.length > 1) {
        dirSet.add(parts[0]);
      }
    }
    if (dirSet.size > 0) {
      for (const d of dirSet) {
        colRoots.push({ dirPath: d, name: d, type: 'bruno' });
      }
    } else {
      colRoots.push({ dirPath: '', name: 'Coleção Importada do Bruno', type: 'bruno' });
    }
  }

  // Ordena raízes pelo comprimento do dirPath descrescente para mapear caminhos mais específicos primeiro
  colRoots.sort((a, b) => b.dirPath.length - a.dirPath.length);

  // Mapeamento de coleções criadas
  const collectionsMap = new Map<string, ApiCollection>();
  const environments: ApiEnvironment[] = [];

  for (const root of colRoots) {
    collectionsMap.set(root.dirPath, {
      id: uid(),
      name: root.name,
      description: `Importado de pasta do Bruno (${root.dirPath || '.'})`,
      folders: [],
      createdAt: Date.now(),
      requests: []
    });
  }

  // Passo 2: Processar cada arquivo
  for (const file of normalized) {
    const parts = file.path.split('/');
    const fileName = parts[parts.length - 1];
    const isBru = fileName.endsWith('.bru');
    const isYml = fileName.endsWith('.yml') || fileName.endsWith('.yaml');

    if (!isBru && !isYml) continue;

    // Encontra a coleção raiz mais próxima deste arquivo
    let matchedRoot: ColRootInfo | null = null;
    for (const root of colRoots) {
      if (!root.dirPath || file.path === root.dirPath || file.path.startsWith(root.dirPath + '/')) {
        matchedRoot = root;
        break;
      }
    }

    if (!matchedRoot) continue;
    const col = collectionsMap.get(matchedRoot.dirPath);
    if (!col) continue;

    // Calcula subpasta relativa dentro da coleção (ex: "Homolog/API Cadastros")
    let relInsideCol = file.path;
    if (matchedRoot.dirPath && file.path.startsWith(matchedRoot.dirPath + '/')) {
      relInsideCol = file.path.slice(matchedRoot.dirPath.length + 1);
    }
    const insideParts = relInsideCol.split('/');
    const folderSegments = insideParts.slice(0, -1);
    const folderPath = folderSegments.join('/');

    // Verifica se é arquivo de metadata de pasta (folder.bru ou folder.yml)
    if (fileName === 'folder.bru' || fileName === 'folder.yml') {
      if (folderPath && !insideParts.includes('environments')) {
        if (!col.folders) col.folders = [];
        if (!col.folders.includes(folderPath)) {
          col.folders.push(folderPath);
        }
      }
      continue;
    }

    // Verifica se é ambiente (dentro de "environments/")
    if (insideParts.includes('environments')) {
      const baseEnvName = fileName.replace(/\.(bru|ya?ml)$/, '');
      const envDisplayName = `${col.name} - ${baseEnvName}`;

      if (isBru) {
        const env = parseBruEnv(file.content, envDisplayName);
        if (env) environments.push(env);
      } else if (isYml) {
        const env = parseYmlEnv(file.content, envDisplayName);
        if (env) environments.push(env);
      }
      continue;
    }

    // Processa requisição
    const defaultReqName = fileName.replace(/\.(bru|ya?ml)$/, '');
    let reqItem: ApiRequestItem | null = null;

    if (isBru) {
      reqItem = parseBruRequest(file.content, defaultReqName);
    } else if (isYml) {
      reqItem = parseYmlRequest(file.content, defaultReqName);
    }

    if (reqItem) {
      reqItem.collectionId = col.id;
      if (folderPath && !insideParts.includes('environments')) {
        reqItem.folder = folderPath;
        if (!col.folders) col.folders = [];
        if (!col.folders.includes(folderPath)) {
          col.folders.push(folderPath);
        }
      }
      col.requests.push(reqItem);
    }
  }

  // Filtra coleções que realmente receberam requisições
  const finalCollections = Array.from(collectionsMap.values()).filter((c) => c.requests.length > 0);
  const totalRequests = finalCollections.reduce((sum, c) => sum + c.requests.length, 0);

  return {
    collections: finalCollections,
    environments,
    totalRequests
  };
}

// --- Leitura Assíncrona de Arquivos a partir de FileList (Browser Directory Picker) ---
export async function importBrunoDirectory(fileList: FileList | File[]): Promise<BrunoImportResult> {
  const files: RawFileEntry[] = [];
  const filesArray = Array.from(fileList);

  for (const file of filesArray) {
    const relPath = (file as any).webkitRelativePath || file.name;
    const ext = relPath.toLowerCase();
    if (
      ext.endsWith('.bru') ||
      ext.endsWith('.yml') ||
      ext.endsWith('.yaml') ||
      ext.endsWith('.json')
    ) {
      try {
        const text = await file.text();
        files.push({ path: relPath, content: text });
      } catch (err) {
        console.warn('Falha ao ler arquivo do Bruno:', relPath, err);
      }
    }
  }

  return importBrunoFromFiles(files);
}
