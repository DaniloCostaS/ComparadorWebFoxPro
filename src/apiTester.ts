import hljs from 'highlight.js/lib/common';
import { saveAs } from 'file-saver';
import {
  promptDialog,
  promptText,
  confirmDialog,
  showToast,
  pickDirectoryWithCustomConfirm,
  confirmFolderUploadDialog
} from './uiFeedback';
import {
  importBrunoDirectory,
  importBrunoFromFiles,
  type BrunoImportResult
} from './brunoImporter';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export type BodyType = 'none' | 'json' | 'xml' | 'form-data' | 'urlencoded' | 'raw';

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export interface KeyValueParam {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface ApiAuth {
  type: AuthType;
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyLocation?: 'header' | 'query';
}

export interface ApiRequestItem {
  id: string;
  collectionId?: string;
  folder?: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueParam[];
  headers: KeyValueParam[];
  auth: ApiAuth;
  bodyType: BodyType;
  bodyContent: string;
  bodyFormData?: KeyValueParam[];
  bodyUrlEncoded?: KeyValueParam[];
  createdAt: number;
  updatedAt: number;
}

export interface ApiCollection {
  id: string;
  name: string;
  description?: string;
  folders?: string[];
  requests: ApiRequestItem[];
  createdAt: number;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiEnvironment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

export interface ApiResponseData {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
  error?: string;
  isCorsError?: boolean;
}

export interface HistoryItem {
  id: string;
  request: ApiRequestItem;
  response?: {
    status: number;
    statusText: string;
    durationMs: number;
    sizeBytes: number;
  };
  timestamp: number;
}

const STORAGE_KEY_COLLECTIONS = 'pwi_api_collections_v1';
const STORAGE_KEY_ENVIRONMENTS = 'pwi_api_environments_v1';
const STORAGE_KEY_ACTIVE_ENV = 'pwi_api_active_env_v1';
const STORAGE_KEY_HISTORY = 'pwi_api_history_v1';
const STORAGE_KEY_CURRENT_REQ = 'pwi_api_current_req_v1';
const STORAGE_KEY_COLLAPSED_COLS = 'pwi_api_collapsed_cols_v1';
const STORAGE_KEY_COLLAPSED_FOLDERS = 'pwi_api_collapsed_folders_v1';
const STORAGE_KEY_GLOBALS = 'pwi_api_globals_v1';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const DEFAULT_GLOBALS: EnvironmentVariable[] = [
  { key: 'ServerIISPWI', value: 'http://localhost:8080', enabled: true },
  { key: 'versaoApp', value: '1.0.0', enabled: true }
];

const DEFAULT_COLLECTIONS: ApiCollection[] = [
  {
    id: 'col-exemplos',
    name: 'Exemplos de APIs Públicas',
    description: 'Requisições de teste prontas para uso',
    createdAt: Date.now(),
    requests: [
      {
        id: 'req-viacep-json',
        collectionId: 'col-exemplos',
        name: 'Consulta CEP (ViaCEP - JSON)',
        method: 'GET',
        url: 'https://viacep.com.br/ws/01001000/json/',
        params: [],
        headers: [
          { id: uid(), key: 'Accept', value: 'application/json', enabled: true }
        ],
        auth: { type: 'none' },
        bodyType: 'none',
        bodyContent: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'req-viacep-xml',
        collectionId: 'col-exemplos',
        name: 'Consulta CEP (ViaCEP - XML)',
        method: 'GET',
        url: 'https://viacep.com.br/ws/01001000/xml/',
        params: [],
        headers: [
          { id: uid(), key: 'Accept', value: 'application/xml', enabled: true }
        ],
        auth: { type: 'none' },
        bodyType: 'none',
        bodyContent: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'req-json-placeholder-get',
        collectionId: 'col-exemplos',
        name: 'Listar Usuários (JSONPlaceholder)',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/users',
        params: [
          { id: uid(), key: '_limit', value: '3', enabled: true, description: 'Limitar resultados' }
        ],
        headers: [
          { id: uid(), key: 'Accept', value: 'application/json', enabled: true }
        ],
        auth: { type: 'none' },
        bodyType: 'none',
        bodyContent: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'req-json-placeholder-post',
        collectionId: 'col-exemplos',
        name: 'Criar Post (JSONPlaceholder)',
        method: 'POST',
        url: 'https://jsonplaceholder.typicode.com/posts',
        params: [],
        headers: [
          { id: uid(), key: 'Content-Type', value: 'application/json; charset=UTF-8', enabled: true }
        ],
        auth: { type: 'none' },
        bodyType: 'json',
        bodyContent: JSON.stringify({
          title: 'Integração de API PWI',
          body: 'Teste de chamada REST via Comparador Web',
          userId: 1
        }, null, 2),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ]
  }
];

const DEFAULT_ENVIRONMENTS: ApiEnvironment[] = [
  {
    id: 'env-local',
    name: 'Desenvolvimento Local',
    variables: [
      { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
      { key: 'ServerIISPWI', value: 'http://localhost:8080', enabled: true },
      { key: 'apiToken', value: 'Bearer_Exemplo_123456', enabled: true }
    ]
  },
  {
    id: 'env-homolog',
    name: 'Homologação',
    variables: [
      { key: 'baseUrl', value: 'https://homolog.api.exemplo.com.br', enabled: true },
      { key: 'ServerIISPWI', value: 'https://homolog.pwi.exemplo.com.br', enabled: true },
      { key: 'apiToken', value: 'Token_Homolog_Secret', enabled: true }
    ]
  }
];

export class ApiTesterController {
  private collections: ApiCollection[] = [];
  private environments: ApiEnvironment[] = [];
  private globalVariables: EnvironmentVariable[] = [];
  private activeEnvironmentId: string = '';
  private history: HistoryItem[] = [];
  private currentRequest: ApiRequestItem;
  private currentAbortController: AbortController | null = null;
  private lastResponse: ApiResponseData | null = null;

  constructor() {
    this.currentRequest = this.createEmptyRequest();
    this.loadState();
  }

  public createEmptyRequest(): ApiRequestItem {
    return {
      id: uid(),
      name: 'Nova Requisição',
      method: 'GET',
      url: '',
      params: [],
      headers: [
        { id: uid(), key: 'Accept', value: 'application/json', enabled: true }
      ],
      auth: { type: 'none' },
      bodyType: 'none',
      bodyContent: '',
      bodyFormData: [],
      bodyUrlEncoded: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  private loadState() {
    try {
      const rawCols = localStorage.getItem(STORAGE_KEY_COLLECTIONS);
      this.collections = rawCols ? JSON.parse(rawCols) : DEFAULT_COLLECTIONS;

      const rawEnvs = localStorage.getItem(STORAGE_KEY_ENVIRONMENTS);
      this.environments = rawEnvs ? JSON.parse(rawEnvs) : DEFAULT_ENVIRONMENTS;

      const rawGlobals = localStorage.getItem(STORAGE_KEY_GLOBALS);
      this.globalVariables = rawGlobals ? JSON.parse(rawGlobals) : DEFAULT_GLOBALS;

      this.activeEnvironmentId = localStorage.getItem(STORAGE_KEY_ACTIVE_ENV) || '';

      const rawHist = localStorage.getItem(STORAGE_KEY_HISTORY);
      this.history = rawHist ? JSON.parse(rawHist) : [];

      const rawCurrent = localStorage.getItem(STORAGE_KEY_CURRENT_REQ);
      if (rawCurrent) {
        this.currentRequest = JSON.parse(rawCurrent);
        // Se a requisição pertencer a uma coleção, sincroniza com a versão salva na coleção
        if (this.currentRequest.collectionId) {
          const col = this.collections.find((c) => c.id === this.currentRequest.collectionId);
          const reqInCol = col?.requests.find((r) => r.id === this.currentRequest.id);
          if (reqInCol) {
            this.currentRequest = JSON.parse(JSON.stringify(reqInCol));
          }
        }
      } else if (this.collections[0]?.requests[0]) {
        this.currentRequest = JSON.parse(JSON.stringify(this.collections[0].requests[0]));
      }
    } catch {
      this.collections = DEFAULT_COLLECTIONS;
      this.environments = DEFAULT_ENVIRONMENTS;
      this.globalVariables = DEFAULT_GLOBALS;
      this.history = [];
    }
  }

  // Atualiza a requisição atual dentro da coleção à qual pertence (auto-save contínuo)
  public updateCurrentRequestInCollection() {
    if (!this.currentRequest || !this.currentRequest.collectionId) return;
    const col = this.collections.find((c) => c.id === this.currentRequest.collectionId);
    if (!col) return;
    const idx = col.requests.findIndex((r) => r.id === this.currentRequest.id);
    if (idx >= 0) {
      col.requests[idx] = JSON.parse(JSON.stringify(this.currentRequest));
    }
  }

  public saveState() {
    try {
      this.updateCurrentRequestInCollection();
      localStorage.setItem(STORAGE_KEY_COLLECTIONS, JSON.stringify(this.collections));
      localStorage.setItem(STORAGE_KEY_ENVIRONMENTS, JSON.stringify(this.environments));
      localStorage.setItem(STORAGE_KEY_GLOBALS, JSON.stringify(this.globalVariables));
      localStorage.setItem(STORAGE_KEY_ACTIVE_ENV, this.activeEnvironmentId);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(this.history.slice(0, 50)));
      localStorage.setItem(STORAGE_KEY_CURRENT_REQ, JSON.stringify(this.currentRequest));
    } catch {
      // Falha silenciosa de quota
    }
  }

  public getCollections(): ApiCollection[] {
    return this.collections;
  }

  public getEnvironments(): ApiEnvironment[] {
    return this.environments;
  }

  public getGlobalVariables(): EnvironmentVariable[] {
    return this.globalVariables;
  }

  public setGlobalVariables(vars: EnvironmentVariable[]) {
    this.globalVariables = vars;
    this.saveState();
  }

  public addGlobalVariable(key = 'novaVariavel', value = ''): EnvironmentVariable {
    const newVar: EnvironmentVariable = { key, value, enabled: true };
    this.globalVariables.push(newVar);
    this.saveState();
    return newVar;
  }

  public deleteGlobalVariable(index: number) {
    if (index >= 0 && index < this.globalVariables.length) {
      this.globalVariables.splice(index, 1);
      this.saveState();
    }
  }

  public getActiveEnvironment(): ApiEnvironment | null {
    return this.environments.find((e) => e.id === this.activeEnvironmentId) || null;
  }

  public setActiveEnvironment(envId: string) {
    this.activeEnvironmentId = envId;
    this.saveState();
  }

  // Retorna todas as variáveis ativas com identificação de escopo (Ambiente vs Global)
  public getActiveVariables(): { key: string; value: string; isGlobal: boolean; envName: string }[] {
    const map = new Map<string, { key: string; value: string; isGlobal: boolean; envName: string }>();

    // 1. Variáveis Globais (disponíveis sempre)
    this.globalVariables.forEach((g) => {
      if (g.enabled !== false && g.key.trim()) {
        map.set(g.key.trim(), {
          key: g.key.trim(),
          value: g.value,
          isGlobal: true,
          envName: 'Global'
        });
      }
    });

    // 2. Variáveis do Ambiente Ativo (sobrescrevem ou complementam as globais)
    const env = this.getActiveEnvironment();
    if (env) {
      env.variables.forEach((v) => {
        if (v.enabled !== false && v.key.trim()) {
          map.set(v.key.trim(), {
            key: v.key.trim(),
            value: v.value,
            isGlobal: false,
            envName: env.name
          });
        }
      });
    }

    return Array.from(map.values());
  }

  public getHistory(): HistoryItem[] {
    return this.history;
  }

  public clearHistory() {
    this.history = [];
    this.saveState();
  }

  public getCurrentRequest(): ApiRequestItem {
    return this.currentRequest;
  }

  public setCurrentRequest(req: ApiRequestItem) {
    this.currentRequest = req;
    this.saveState();
  }

  public getLastResponse(): ApiResponseData | null {
    return this.lastResponse;
  }

  // --- Resolução de Variáveis ({{chave}}) ---
  public interpolate(text: string): string {
    if (!text) return text;
    const activeVars = this.getActiveVariables();
    const varMap = new Map<string, string>();
    activeVars.forEach((v) => varMap.set(v.key, v.value));

    return text.replace(/\{\{([^{}]+)\}\}/g, (match, varName) => {
      const trimmed = varName.trim();
      return varMap.has(trimmed) ? varMap.get(trimmed)! : match;
    });
  }

  // --- Gerenciamento de Coleções ---
  public addCollection(name: string, description = ''): ApiCollection {
    const newCol: ApiCollection = {
      id: uid(),
      name: name.trim() || 'Nova Coleção',
      description,
      requests: [],
      createdAt: Date.now()
    };
    this.collections.push(newCol);
    this.saveState();
    return newCol;
  }

  public deleteCollection(collectionId: string) {
    this.collections = this.collections.filter((c) => c.id !== collectionId);
    this.saveState();
  }

  // --- Gerenciamento de Subpastas nas Coleções ---
  public addFolderToCollection(collectionId: string, folderPath: string) {
    const col = this.collections.find((c) => c.id === collectionId);
    if (!col) return;
    const clean = folderPath.trim().replace(/^[\/\\]+|[\/\\]+$/g, '');
    if (!clean) return;
    if (!col.folders) col.folders = [];
    if (!col.folders.includes(clean)) {
      col.folders.push(clean);
      this.saveState();
    }
  }

  public deleteFolderFromCollection(collectionId: string, folderPath: string) {
    const col = this.collections.find((c) => c.id === collectionId);
    if (!col) return;
    const clean = folderPath.trim().replace(/^[\/\\]+|[\/\\]+$/g, '');
    const prefix = clean + '/';

    // Remove requisições contidas nesta pasta ou subpastas
    col.requests = col.requests.filter(
      (r) => !r.folder || (r.folder !== clean && !r.folder.startsWith(prefix))
    );

    // Remove pasta e subpastas da lista explícita
    if (col.folders) {
      col.folders = col.folders.filter((f) => f !== clean && !f.startsWith(prefix));
    }
    this.saveState();
  }

  public renameFolderInCollection(collectionId: string, oldPath: string, newPath: string) {
    const col = this.collections.find((c) => c.id === collectionId);
    if (!col) return;
    const cleanOld = oldPath.trim().replace(/^[\/\\]+|[\/\\]+$/g, '');
    const cleanNew = newPath.trim().replace(/^[\/\\]+|[\/\\]+$/g, '');
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
    const oldPrefix = cleanOld + '/';

    col.requests.forEach((r) => {
      if (r.folder === cleanOld) {
        r.folder = cleanNew;
      } else if (r.folder && r.folder.startsWith(oldPrefix)) {
        r.folder = cleanNew + '/' + r.folder.slice(oldPrefix.length);
      }
    });

    if (col.folders) {
      col.folders = col.folders.map((f) => {
        if (f === cleanOld) return cleanNew;
        if (f.startsWith(oldPrefix)) return cleanNew + '/' + f.slice(oldPrefix.length);
        return f;
      });
    }
    this.saveState();
  }

  public saveCurrentRequestToCollection(collectionId: string, reqName?: string, folder?: string) {
    const col = this.collections.find((c) => c.id === collectionId);
    if (!col) return;

    if (reqName) this.currentRequest.name = reqName;
    if (folder !== undefined) this.currentRequest.folder = folder || undefined;
    this.currentRequest.collectionId = collectionId;
    this.currentRequest.updatedAt = Date.now();

    const existingIndex = col.requests.findIndex((r) => r.id === this.currentRequest.id);
    if (existingIndex >= 0) {
      col.requests[existingIndex] = JSON.parse(JSON.stringify(this.currentRequest));
    } else {
      col.requests.push(JSON.parse(JSON.stringify(this.currentRequest)));
    }
    this.saveState();
  }

  public deleteRequestFromCollection(collectionId: string, requestId: string) {
    const col = this.collections.find((c) => c.id === collectionId);
    if (!col) return;
    col.requests = col.requests.filter((r) => r.id !== requestId);
    this.saveState();
  }

  // --- Gerenciamento de Ambientes ---
  public addEnvironment(name: string): ApiEnvironment {
    const newEnv: ApiEnvironment = {
      id: uid(),
      name: name.trim() || 'Novo Ambiente',
      variables: [
        { key: 'baseUrl', value: 'http://localhost:8080', enabled: true }
      ]
    };
    this.environments.push(newEnv);
    this.saveState();
    return newEnv;
  }

  public deleteEnvironment(envId: string) {
    this.environments = this.environments.filter((e) => e.id !== envId);
    if (this.activeEnvironmentId === envId) {
      this.activeEnvironmentId = '';
    }
    this.saveState();
  }

  public updateEnvironmentVariables(envId: string, variables: EnvironmentVariable[]) {
    const env = this.environments.find((e) => e.id === envId);
    if (!env) return;
    env.variables = variables;
    this.saveState();
  }

  // --- Parser cURL ---
  public parseCurl(rawCurl: string): Partial<ApiRequestItem> {
    const clean = rawCurl.trim().replace(/\\\n/g, ' ').replace(/\n/g, ' ');

    let method: HttpMethod = 'GET';
    let url = '';
    const headers: KeyValueParam[] = [];
    let bodyContent = '';
    let bodyType: BodyType = 'none';

    // Detect method
    const methodMatch = clean.match(/(?:-X|--request)\s+([A-Za-z]+)/i);
    if (methodMatch) {
      method = methodMatch[1].toUpperCase() as HttpMethod;
    } else if (clean.includes('-d ') || clean.includes('--data ') || clean.includes('--data-raw ')) {
      method = 'POST';
    }

    // Detect URL (primeira string entre aspas ou palavra após curl)
    const urlMatch = clean.match(/(?:curl\s+)?(?:["'])(https?:\/\/[^"']+)(?:["'])|(?:https?:\/\/[^\s"']+)/i);
    if (urlMatch) {
      url = urlMatch[1] || urlMatch[0];
    }

    // Detect Headers (-H "Key: Value")
    const headerRegex = /(?:-H|--header)\s+["']([^"']+)["']/gi;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = headerRegex.exec(clean)) !== null) {
      const fullHeader = hMatch[1];
      const colonIndex = fullHeader.indexOf(':');
      if (colonIndex > 0) {
        const key = fullHeader.substring(0, colonIndex).trim();
        const value = fullHeader.substring(colonIndex + 1).trim();
        headers.push({ id: uid(), key, value, enabled: true });
      }
    }

    // Detect Body (-d / --data / --data-raw)
    const bodyMatch = clean.match(/(?:-d|--data|--data-raw|--data-binary)\s+["']([\s\S]*?)["'](?:\s+-[A-Za-z]|$)/i);
    if (bodyMatch) {
      bodyContent = bodyMatch[1];
      try {
        JSON.parse(bodyContent);
        bodyType = 'json';
      } catch {
        bodyType = bodyContent.startsWith('<') ? 'xml' : 'raw';
      }
    }

    return {
      name: url ? `cURL: ${url.split('/').pop() || url}` : 'Requisição cURL',
      method,
      url,
      headers: headers.length > 0 ? headers : [{ id: uid(), key: 'Accept', value: '*/*', enabled: true }],
      bodyType,
      bodyContent
    };
  }

  // --- Gerador de Snippets de Código ---
  public generateSnippet(req: ApiRequestItem, lang: 'curl' | 'fetch' | 'csharp' | 'python' | 'foxpro'): string {
    const url = this.interpolate(req.url);
    const method = req.method;

    // Headers compilados
    const headerObj: Record<string, string> = {};
    req.headers.filter((h) => h.enabled && h.key).forEach((h) => {
      headerObj[this.interpolate(h.key)] = this.interpolate(h.value);
    });

    // Auth
    if (req.auth.type === 'bearer' && req.auth.bearerToken) {
      headerObj['Authorization'] = `Bearer ${this.interpolate(req.auth.bearerToken)}`;
    } else if (req.auth.type === 'basic' && (req.auth.basicUser || req.auth.basicPass)) {
      const u = this.interpolate(req.auth.basicUser || '');
      const p = this.interpolate(req.auth.basicPass || '');
      headerObj['Authorization'] = `Basic ${btoa(`${u}:${p}`)}`;
    } else if (req.auth.type === 'apikey' && req.auth.apiKeyName && req.auth.apiKeyLocation === 'header') {
      headerObj[this.interpolate(req.auth.apiKeyName)] = this.interpolate(req.auth.apiKeyValue || '');
    }

    const body = req.bodyType !== 'none' ? this.interpolate(req.bodyContent) : '';

    switch (lang) {
      case 'curl': {
        const parts = [`curl -X ${method} "${url}"`];
        Object.entries(headerObj).forEach(([k, v]) => {
          parts.push(`  -H "${k}: ${v}"`);
        });
        if (body && method !== 'GET' && method !== 'HEAD') {
          parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
        }
        return parts.join(' \\\n');
      }

      case 'fetch': {
        const headersStr = JSON.stringify(headerObj, null, 2);
        const bodyPart = body && method !== 'GET' && method !== 'HEAD' ? `,\n  body: ${JSON.stringify(body)}` : '';
        return `// JavaScript / TypeScript (Fetch API)
const response = await fetch("${url}", {
  method: "${method}",
  headers: ${headersStr}${bodyPart}
});

const data = await response.json();
console.log(data);`;
      }

      case 'csharp': {
        const headersCode = Object.entries(headerObj)
          .map(([k, v]) => `request.Headers.Add("${k}", "${v}");`)
          .join('\n');
        const contentCode = body && method !== 'GET' && method !== 'HEAD'
          ? `\nrequest.Content = new StringContent(${JSON.stringify(body)}, Encoding.UTF8, "application/json");`
          : '';

        return `// C# (.NET HttpClient)
using var client = new HttpClient();
using var request = new HttpRequestMessage(HttpMethod.${method.charAt(0) + method.slice(1).toLowerCase()}, "${url}");
${headersCode}${contentCode}

using var response = await client.SendAsync(request);
response.EnsureSuccessStatusCode();
string responseBody = await response.Content.ReadAsStringAsync();
Console.WriteLine(responseBody);`;
      }

      case 'python': {
        const headersStr = JSON.stringify(headerObj, null, 4);
        const bodyPart = body && method !== 'GET' && method !== 'HEAD' ? `, data=${JSON.stringify(body)}` : '';
        return `# Python (requests)
import requests

url = "${url}"
headers = ${headersStr}

response = requests.${method.toLowerCase()}(url, headers=headers${bodyPart})
print(response.status_code)
print(response.text)`;
      }

      case 'foxpro': {
        const setHeadersCode = Object.entries(headerObj)
          .map(([k, v]) => `loHttp.setRequestHeader("${k}", "${v}")`)
          .join('\n');
        const sendParam = body && method !== 'GET' && method !== 'HEAD' ? `"${body.replace(/"/g, '""')}"` : '';

        return `*-- Visual FoxPro (MSXML2.ServerXMLHTTP)
LOCAL loHttp, lcUrl, lcResponse
lcUrl = "${url}"

loHttp = CREATEOBJECT("MSXML2.ServerXMLHTTP.6.0")
loHttp.Open("${method}", lcUrl, .F.)
${setHeadersCode}

loHttp.Send(${sendParam})

IF loHttp.Status = 200
    lcResponse = loHttp.ResponseText
    MESSAGEBOX("Sucesso: " + lcResponse, 64, "API PWI")
ELSE
    MESSAGEBOX("Erro: " + TRANSFORM(loHttp.Status) + " - " + loHttp.StatusText, 16, "Falha na Requisição")
ENDIF
loHttp = .NULL.`;
      }
    }
  }

  // --- Execução da Requisição HTTP ---
  public async executeCurrentRequest(): Promise<ApiResponseData> {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();

    const req = this.currentRequest;

    // 1. Monta URL com Query Params
    let fullUrl = this.interpolate(req.url.trim());
    const enabledParams = req.params.filter((p) => p.enabled && p.key.trim());

    if (enabledParams.length > 0) {
      const urlObj = new URL(fullUrl, window.location.origin);
      enabledParams.forEach((p) => {
        urlObj.searchParams.set(this.interpolate(p.key.trim()), this.interpolate(p.value.trim()));
      });
      fullUrl = fullUrl.startsWith('http') ? urlObj.toString() : urlObj.pathname + urlObj.search;
    }

    // 2. Monta Headers
    const headers = new Headers();
    req.headers.filter((h) => h.enabled && h.key.trim()).forEach((h) => {
      headers.set(this.interpolate(h.key.trim()), this.interpolate(h.value.trim()));
    });

    // 3. Autenticação
    if (req.auth.type === 'bearer' && req.auth.bearerToken) {
      headers.set('Authorization', `Bearer ${this.interpolate(req.auth.bearerToken.trim())}`);
    } else if (req.auth.type === 'basic' && (req.auth.basicUser || req.auth.basicPass)) {
      const u = this.interpolate(req.auth.basicUser || '');
      const p = this.interpolate(req.auth.basicPass || '');
      headers.set('Authorization', `Basic ${btoa(`${u}:${p}`)}`);
    } else if (req.auth.type === 'apikey' && req.auth.apiKeyName && req.auth.apiKeyLocation === 'header') {
      headers.set(this.interpolate(req.auth.apiKeyName), this.interpolate(req.auth.apiKeyValue || ''));
    }

    // 4. Monta Corpo
    let body: any = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.bodyType === 'json') {
        body = this.interpolate(req.bodyContent);
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
      } else if (req.bodyType === 'xml') {
        body = this.interpolate(req.bodyContent);
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/xml');
        }
      } else if (req.bodyType === 'raw') {
        body = this.interpolate(req.bodyContent);
      } else if (req.bodyType === 'urlencoded' && req.bodyUrlEncoded) {
        const formParams = new URLSearchParams();
        req.bodyUrlEncoded.filter((p) => p.enabled && p.key).forEach((p) => {
          formParams.set(this.interpolate(p.key), this.interpolate(p.value));
        });
        body = formParams.toString();
        headers.set('Content-Type', 'application/x-www-form-urlencoded');
      }
    }

    const startTime = performance.now();
    try {
      const response = await fetch(fullUrl, {
        method: req.method,
        headers,
        body,
        signal: this.currentAbortController.signal
      });

      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      const resText = await response.text();
      const sizeBytes = new Blob([resText]).size;

      const resHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        resHeaders[key] = value;
      });

      const responseData: ApiResponseData = {
        status: response.status,
        statusText: response.statusText || 'OK',
        durationMs,
        sizeBytes,
        headers: resHeaders,
        body: resText,
        timestamp: Date.now()
      };

      this.lastResponse = responseData;

      // Adiciona ao Histórico
      this.history.unshift({
        id: uid(),
        request: JSON.parse(JSON.stringify(req)),
        response: {
          status: response.status,
          statusText: responseData.statusText,
          durationMs,
          sizeBytes
        },
        timestamp: Date.now()
      });
      this.saveState();

      return responseData;
    } catch (err: any) {
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      const isCors = err.name === 'TypeError' || (err.message && err.message.toLowerCase().includes('fetch')) || (err.message && err.message.toLowerCase().includes('network'));

      const errorData: ApiResponseData = {
        status: 0,
        statusText: isCors ? 'Falha de Conexão / CORS' : 'Erro de Rede',
        durationMs,
        sizeBytes: 0,
        headers: {},
        body: '',
        timestamp: Date.now(),
        error: err.message || 'Falha ao executar requisição',
        isCorsError: isCors
      };

      this.lastResponse = errorData;
      return errorData;
    } finally {
      this.currentAbortController = null;
    }
  }

  public cancelCurrentRequest() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  // --- Exportar / Importar Coleções ---
  public exportCollectionsJson(): string {
    return JSON.stringify(
      {
        info: {
          name: 'Coleções do Comparador PWI - API Client',
          version: '1.0.0',
          exportedAt: new Date().toISOString()
        },
        collections: this.collections,
        environments: this.environments,
        globals: this.globalVariables
      },
      null,
      2
    );
  }

  public importBrunoResult(
    result: BrunoImportResult,
    mergeExisting = true
  ): { importedCols: number; importedReqs: number; importedEnvs: number } {
    let importedCols = 0;
    let importedReqs = 0;
    let importedEnvs = 0;

    for (const incomingCol of result.collections) {
      const existing = mergeExisting
        ? this.collections.find((c) => c.name.trim().toLowerCase() === incomingCol.name.trim().toLowerCase())
        : null;

      if (existing) {
        if (incomingCol.folders) {
          if (!existing.folders) existing.folders = [];
          for (const f of incomingCol.folders) {
            if (!existing.folders.includes(f)) existing.folders.push(f);
          }
        }
        for (const req of incomingCol.requests) {
          req.collectionId = existing.id;
          const duplicate = existing.requests.find(
            (r) => r.name === req.name && r.method === req.method && (r.folder || '') === (req.folder || '')
          );
          if (!duplicate) {
            existing.requests.push(req);
            importedReqs++;
          }
        }
      } else {
        incomingCol.id = uid();
        for (const req of incomingCol.requests) {
          req.collectionId = incomingCol.id;
          importedReqs++;
        }
        this.collections.push(incomingCol);
        importedCols++;
      }
    }

    for (const incomingEnv of result.environments) {
      const existing = this.environments.find(
        (e) => e.name.trim().toLowerCase() === incomingEnv.name.trim().toLowerCase()
      );
      if (existing) {
        for (const v of incomingEnv.variables) {
          const varExist = existing.variables.find((ev) => ev.key.toLowerCase() === v.key.toLowerCase());
          if (!varExist) {
            existing.variables.push(v);
          } else if (!varExist.value && v.value) {
            varExist.value = v.value;
          }
        }
      } else {
        incomingEnv.id = uid();
        this.environments.push(incomingEnv);
        importedEnvs++;
      }
    }

    this.saveState();
    return { importedCols, importedReqs, importedEnvs };
  }

  public importCollectionsJson(jsonText: string): { importedCols: number; importedEnvs: number } {
    const trimmed = jsonText.trim();

    // Se parecer com arquivo .bru ou .yml do Bruno/OpenCollection
    if (
      trimmed.includes('meta {') ||
      trimmed.startsWith('opencollection:') ||
      (trimmed.includes('info:') && trimmed.includes('http:'))
    ) {
      const brunoRes = importBrunoFromFiles([{ path: 'Colecao_Importada/Requisicao', content: jsonText }]);
      const res = this.importBrunoResult(brunoRes, true);
      return { importedCols: res.importedCols, importedEnvs: res.importedEnvs };
    }

    const data = JSON.parse(jsonText);
    let importedCols = 0;
    let importedEnvs = 0;

    // Formato Postman Collection v2.1
    if (data.info && data.item && Array.isArray(data.item)) {
      const postmanCol: ApiCollection = {
        id: uid(),
        name: data.info.name || 'Coleção Importada do Postman',
        description: data.info.description || '',
        createdAt: Date.now(),
        requests: []
      };

      const parsePostmanItems = (items: any[]) => {
        items.forEach((it) => {
          if (it.request) {
            const method = (it.request.method || 'GET').toUpperCase() as HttpMethod;
            const urlRaw = typeof it.request.url === 'string' ? it.request.url : it.request.url?.raw || '';
            const headers: KeyValueParam[] = (it.request.header || []).map((h: any) => ({
              id: uid(),
              key: h.key,
              value: h.value,
              enabled: h.disabled !== true
            }));

            postmanCol.requests.push({
              id: uid(),
              collectionId: postmanCol.id,
              name: it.name || urlRaw,
              method,
              url: urlRaw,
              params: [],
              headers,
              auth: { type: 'none' },
              bodyType: it.request.body?.mode === 'raw' ? 'json' : 'none',
              bodyContent: it.request.body?.raw || '',
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          } else if (it.item && Array.isArray(it.item)) {
            parsePostmanItems(it.item);
          }
        });
      };

      parsePostmanItems(data.item);
      this.collections.push(postmanCol);
      importedCols = 1;
    } else if (data.collections && Array.isArray(data.collections)) {
      // Formato Nativo do PWI
      data.collections.forEach((col: ApiCollection) => {
        col.id = uid();
        col.requests.forEach((r) => {
          r.id = uid();
          r.collectionId = col.id;
        });
        this.collections.push(col);
        importedCols++;
      });

      if (data.environments && Array.isArray(data.environments)) {
        data.environments.forEach((env: ApiEnvironment) => {
          env.id = uid();
          this.environments.push(env);
          importedEnvs++;
        });
      }

      if (data.globals && Array.isArray(data.globals)) {
        data.globals.forEach((g: EnvironmentVariable) => {
          if (!this.globalVariables.some((existing) => existing.key === g.key)) {
            this.globalVariables.push(g);
          }
        });
      }
    }

    this.saveState();
    return { importedCols, importedEnvs };
  }
}

// --- Inicialização da UI do Testador de API ---
export function initApiTesterUI() {
  const controller = new ApiTesterController();

  // Elementos do Topo & URL Bar
  const methodSelect = document.getElementById('api-method-select') as HTMLSelectElement | null;
  const urlInput = document.getElementById('api-url-input') as HTMLInputElement | null;
  const btnSend = document.getElementById('btn-api-send') as HTMLButtonElement | null;
  const btnCancel = document.getElementById('btn-api-cancel') as HTMLButtonElement | null;
  const btnVarsPicker = document.getElementById('btn-api-vars-picker') as HTMLButtonElement | null;
  const varsPopover = document.getElementById('api-vars-popover') as HTMLDivElement | null;
  const urlVarTooltip = document.getElementById('api-url-var-tooltip') as HTMLDivElement | null;
  const urlResolvedPreview = document.getElementById('api-url-resolved-preview') as HTMLDivElement | null;
  const urlResolvedText = document.getElementById('api-url-resolved-text') as HTMLElement | null;
  const urlResolvedStatus = document.getElementById('api-url-resolved-status') as HTMLElement | null;
  const requestNameInput = document.getElementById('api-request-name') as HTMLInputElement | null;
  const activeEnvSelect = document.getElementById('api-active-env-select') as HTMLSelectElement | null;
  const btnManageEnvs = document.getElementById('btn-api-manage-envs') as HTMLButtonElement | null;
  const btnSaveToCol = document.getElementById('btn-api-save-to-col') as HTMLButtonElement | null;
  const btnShowSnippet = document.getElementById('btn-api-show-snippet') as HTMLButtonElement | null;

  // Sidebar e Coleções
  const tabSidebarCols = document.getElementById('api-tab-sidebar-cols') as HTMLButtonElement | null;
  const tabSidebarHist = document.getElementById('api-tab-sidebar-hist') as HTMLButtonElement | null;
  const paneSidebarCols = document.getElementById('api-pane-sidebar-cols') as HTMLElement | null;
  const paneSidebarHist = document.getElementById('api-pane-sidebar-hist') as HTMLElement | null;
  const collectionsList = document.getElementById('api-collections-list') as HTMLElement | null;
  const historyList = document.getElementById('api-history-list') as HTMLElement | null;
  const btnNewCol = document.getElementById('btn-api-new-col') as HTMLButtonElement | null;
  const btnNewReq = document.getElementById('btn-api-new-req') as HTMLButtonElement | null;
  const btnToggleAllCols = document.getElementById('btn-api-toggle-all-cols') as HTMLButtonElement | null;
  const btnImport = document.getElementById('btn-api-import') as HTMLButtonElement | null;
  const btnExport = document.getElementById('btn-api-export') as HTMLButtonElement | null;
  const btnClearHist = document.getElementById('btn-api-clear-hist') as HTMLButtonElement | null;
  const searchReqInput = document.getElementById('api-search-req-input') as HTMLInputElement | null;

  // Estado de Pastas Recolhidas/Expandidas
  function loadCollapsedState(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COLLAPSED_COLS);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveCollapsedState(set: Set<string>) {
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED_COLS, JSON.stringify(Array.from(set)));
    } catch {
      // ignore
    }
  }

  const collapsedColIds = loadCollapsedState();

  function loadCollapsedFoldersState(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COLLAPSED_FOLDERS);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveCollapsedFoldersState(set: Set<string>) {
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED_FOLDERS, JSON.stringify(Array.from(set)));
    } catch {
      // ignore
    }
  }

  const collapsedFolderKeys = loadCollapsedFoldersState();

  // Abas de Configuração da Requisição
  const reqTabs = ['params', 'headers', 'auth', 'body'];
  const reqTabBtns: Record<string, HTMLButtonElement | null> = {};
  const reqTabPanes: Record<string, HTMLElement | null> = {};
  reqTabs.forEach((tab) => {
    reqTabBtns[tab] = document.getElementById(`btn-api-tab-${tab}`) as HTMLButtonElement | null;
    reqTabPanes[tab] = document.getElementById(`api-tab-pane-${tab}`) as HTMLElement | null;
  });

  // Params e Headers Tables
  const paramsTableBody = document.getElementById('api-params-tbody') as HTMLElement | null;
  const btnAddParam = document.getElementById('btn-api-add-param') as HTMLButtonElement | null;
  const headersTableBody = document.getElementById('api-headers-tbody') as HTMLElement | null;
  const btnAddHeader = document.getElementById('btn-api-add-header') as HTMLButtonElement | null;

  // Auth Inputs
  const authTypeSelect = document.getElementById('api-auth-type-select') as HTMLSelectElement | null;
  const authPaneBearer = document.getElementById('api-auth-pane-bearer') as HTMLElement | null;
  const authPaneBasic = document.getElementById('api-auth-pane-basic') as HTMLElement | null;
  const authPaneApiKey = document.getElementById('api-auth-pane-apikey') as HTMLElement | null;
  const authBearerTokenInput = document.getElementById('api-auth-bearer-token') as HTMLInputElement | null;
  const authBasicUserInput = document.getElementById('api-auth-basic-user') as HTMLInputElement | null;
  const authBasicPassInput = document.getElementById('api-auth-basic-pass') as HTMLInputElement | null;
  const authApiKeyNameInput = document.getElementById('api-auth-apikey-name') as HTMLInputElement | null;
  const authApiKeyValueInput = document.getElementById('api-auth-apikey-value') as HTMLInputElement | null;
  const authApiKeyLocationSelect = document.getElementById('api-auth-apikey-location') as HTMLSelectElement | null;

  // Body Inputs
  const bodyTypeSelect = document.getElementById('api-body-type-select') as HTMLSelectElement | null;
  const bodyContentTextarea = document.getElementById('api-body-content') as HTMLTextAreaElement | null;
  const btnFormatBody = document.getElementById('btn-api-format-body') as HTMLButtonElement | null;

  // Painel de Resposta
  const resStatusBar = document.getElementById('api-res-status-bar') as HTMLElement | null;
  const resStatusCodeBadge = document.getElementById('api-res-status-badge') as HTMLElement | null;
  const resDuration = document.getElementById('api-res-duration') as HTMLElement | null;
  const resSize = document.getElementById('api-res-size') as HTMLElement | null;
  const resEmptyState = document.getElementById('api-res-empty-state') as HTMLElement | null;
  const resLoadingState = document.getElementById('api-res-loading-state') as HTMLElement | null;
  const resContentArea = document.getElementById('api-res-content-area') as HTMLElement | null;
  const resCorsWarning = document.getElementById('api-res-cors-warning') as HTMLElement | null;

  // Abas de Resposta
  const resTabBtns = {
    pretty: document.getElementById('btn-api-res-tab-pretty') as HTMLButtonElement | null,
    raw: document.getElementById('btn-api-res-tab-raw') as HTMLButtonElement | null,
    headers: document.getElementById('btn-api-res-tab-headers') as HTMLButtonElement | null
  };
  const resTabPanes = {
    pretty: document.getElementById('api-res-pane-pretty') as HTMLElement | null,
    raw: document.getElementById('api-res-pane-raw') as HTMLElement | null,
    headers: document.getElementById('api-res-pane-headers') as HTMLElement | null
  };
  const resBodyPretty = document.getElementById('api-res-body-pretty') as HTMLElement | null;
  const resBodyRaw = document.getElementById('api-res-body-raw') as HTMLTextAreaElement | null;
  const resHeadersTbody = document.getElementById('api-res-headers-tbody') as HTMLElement | null;

  // Ações de Resposta
  const btnCopyRes = document.getElementById('btn-api-copy-res') as HTMLButtonElement | null;
  const btnDownloadRes = document.getElementById('btn-api-download-res') as HTMLButtonElement | null;
  const btnSendToXmlValidator = document.getElementById('btn-api-send-to-xml') as HTMLButtonElement | null;
  const btnSendToBeautifier = document.getElementById('btn-api-send-to-beautifier') as HTMLButtonElement | null;
  const btnSendToComparator = document.getElementById('btn-api-send-to-comparator') as HTMLButtonElement | null;

  // Modais
  const modalEnvs = document.getElementById('api-modal-envs') as HTMLElement | null;
  const btnCloseModalEnvs = document.getElementById('btn-close-api-modal-envs') as HTMLButtonElement | null;
  const envsListModal = document.getElementById('api-modal-envs-list') as HTMLElement | null;
  const btnModalAddEnv = document.getElementById('btn-api-modal-add-env') as HTMLButtonElement | null;

  const modalSnippet = document.getElementById('api-modal-snippet') as HTMLElement | null;
  const btnCloseModalSnippet = document.getElementById('btn-close-api-modal-snippet') as HTMLButtonElement | null;
  const snippetLangSelect = document.getElementById('api-snippet-lang-select') as HTMLSelectElement | null;
  const snippetContent = document.getElementById('api-snippet-content') as HTMLElement | null;
  const btnCopySnippet = document.getElementById('btn-api-copy-snippet') as HTMLButtonElement | null;

  const modalImport = document.getElementById('api-modal-import') as HTMLElement | null;
  const btnCloseModalImport = document.getElementById('btn-close-api-modal-import') as HTMLButtonElement | null;
  const importTextInput = document.getElementById('api-import-text') as HTMLTextAreaElement | null;
  const btnConfirmImport = document.getElementById('btn-api-confirm-import') as HTMLButtonElement | null;
  const btnImportBruno = document.getElementById('btn-api-import-bruno') as HTMLButtonElement | null;

  // Abas do Modal de Importação
  const tabBtnImportBruno = document.getElementById('tab-btn-import-bruno') as HTMLButtonElement | null;
  const tabBtnImportText = document.getElementById('tab-btn-import-text') as HTMLButtonElement | null;
  const tabPaneImportBruno = document.getElementById('tab-pane-import-bruno') as HTMLElement | null;
  const tabPaneImportText = document.getElementById('tab-pane-import-text') as HTMLElement | null;

  // Elementos do Bruno Import
  const brunoFolderInput = document.getElementById('api-bruno-folder-input') as HTMLInputElement | null;
  const brunoDropzone = document.getElementById('api-bruno-dropzone') as HTMLElement | null;
  const brunoPathInput = document.getElementById('api-bruno-path-input') as HTMLInputElement | null;
  const btnBrunoLoadPath = document.getElementById('btn-api-bruno-load-path') as HTMLButtonElement | null;
  const brunoPreviewContainer = document.getElementById('api-bruno-preview-container') as HTMLElement | null;
  const brunoPreviewStats = document.getElementById('api-bruno-preview-stats') as HTMLElement | null;
  const brunoPreviewList = document.getElementById('api-bruno-preview-list') as HTMLElement | null;
  const brunoMergeCheckbox = document.getElementById('api-bruno-merge-checkbox') as HTMLInputElement | null;
  const btnConfirmBrunoImport = document.getElementById('btn-api-confirm-bruno-import') as HTMLButtonElement | null;
  const btnCancelBrunoImport = document.getElementById('btn-api-cancel-bruno-import') as HTMLButtonElement | null;

  let pendingBrunoResult: BrunoImportResult | null = null;

  // Sincroniza estado para a interface
  function syncRequestToUI(req: ApiRequestItem) {
    if (requestNameInput) requestNameInput.value = req.name;
    if (methodSelect) {
      methodSelect.value = req.method;
      updateMethodSelectColor(req.method);
    }
    if (urlInput) urlInput.value = req.url;

    // Renderiza Parâmetros
    renderParamsTable();
    // Renderiza Headers
    renderHeadersTable();

    // Autenticação
    if (authTypeSelect) authTypeSelect.value = req.auth.type;
    updateAuthPanes(req.auth.type);
    if (authBearerTokenInput) authBearerTokenInput.value = req.auth.bearerToken || '';
    if (authBasicUserInput) authBasicUserInput.value = req.auth.basicUser || '';
    if (authBasicPassInput) authBasicPassInput.value = req.auth.basicPass || '';
    if (authApiKeyNameInput) authApiKeyNameInput.value = req.auth.apiKeyName || '';
    if (authApiKeyValueInput) authApiKeyValueInput.value = req.auth.apiKeyValue || '';
    if (authApiKeyLocationSelect) authApiKeyLocationSelect.value = req.auth.apiKeyLocation || 'header';

    // Body
    if (bodyTypeSelect) bodyTypeSelect.value = req.bodyType;
    if (bodyContentTextarea) bodyContentTextarea.value = req.bodyContent || '';

    updateUrlResolvedPreview();
  }

  function syncUIToRequest() {
    const req = controller.getCurrentRequest();
    if (requestNameInput) req.name = requestNameInput.value.trim() || 'Sem Título';
    if (methodSelect) req.method = methodSelect.value as HttpMethod;
    if (urlInput) req.url = urlInput.value.trim();

    // Auth
    if (authTypeSelect) req.auth.type = authTypeSelect.value as AuthType;
    if (authBearerTokenInput) req.auth.bearerToken = authBearerTokenInput.value;
    if (authBasicUserInput) req.auth.basicUser = authBasicUserInput.value;
    if (authBasicPassInput) req.auth.basicPass = authBasicPassInput.value;
    if (authApiKeyNameInput) req.auth.apiKeyName = authApiKeyNameInput.value;
    if (authApiKeyValueInput) req.auth.apiKeyValue = authApiKeyValueInput.value;
    if (authApiKeyLocationSelect) req.auth.apiKeyLocation = authApiKeyLocationSelect.value as 'header' | 'query';

    // Body
    if (bodyTypeSelect) req.bodyType = bodyTypeSelect.value as BodyType;
    if (bodyContentTextarea) req.bodyContent = bodyContentTextarea.value;

    controller.saveState();
    updateUrlResolvedPreview();
  }

  function updateMethodSelectColor(method: string) {
    if (!methodSelect) return;
    methodSelect.className = methodSelect.className.replace(/text-(green|blue|amber|purple|red|slate)-\d+/g, '');
    const colorMap: Record<string, string> = {
      GET: 'text-emerald-500 font-bold',
      POST: 'text-blue-500 font-bold',
      PUT: 'text-amber-500 font-bold',
      PATCH: 'text-purple-500 font-bold',
      DELETE: 'text-rose-500 font-bold',
      OPTIONS: 'text-slate-400 font-bold',
      HEAD: 'text-slate-400 font-bold'
    };
    methodSelect.classList.add(...(colorMap[method] || 'text-slate-200').split(' '));
  }

  // --- Renderização de Tabelas de Parâmetros e Headers ---
  function renderParamsTable() {
    if (!paramsTableBody) return;
    const req = controller.getCurrentRequest();
    paramsTableBody.innerHTML = '';

    if (req.params.length === 0) {
      paramsTableBody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-xs text-gray-400 dark:text-slate-500 italic">Nenhum parâmetro de URL configurado. Clique em "+ Adicionar Parâmetro".</td></tr>`;
      return;
    }

    req.params.forEach((param, index) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-gray-200 dark:border-slate-800 hover:bg-gray-50/50 dark:hover:bg-slate-900/50 transition-colors';
      tr.innerHTML = `
        <td class="p-2 text-center w-10">
          <input type="checkbox" class="param-enable rounded border-gray-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500" ${param.enabled ? 'checked' : ''} data-index="${index}" />
        </td>
        <td class="p-2">
          <input type="text" class="param-key w-full px-2 py-1 text-xs bg-transparent border border-gray-200 dark:border-slate-800 rounded text-gray-900 dark:text-slate-100 font-mono focus:border-indigo-500 focus:outline-none" value="${escapeHtml(param.key)}" placeholder="Parâmetro" data-index="${index}" />
        </td>
        <td class="p-2">
          <input type="text" class="param-value w-full px-2 py-1 text-xs bg-transparent border border-gray-200 dark:border-slate-800 rounded text-gray-900 dark:text-slate-100 font-mono focus:border-indigo-500 focus:outline-none" value="${escapeHtml(param.value)}" placeholder="Valor ou {{var}}" data-index="${index}" />
        </td>
        <td class="p-2 text-center w-10">
          <button type="button" class="btn-remove-param text-gray-400 hover:text-red-500 p-1 transition-colors cursor-pointer" data-index="${index}" title="Remover">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </td>
      `;
      paramsTableBody.appendChild(tr);
    });

    // Eventos de edição nos inputs
    paramsTableBody.querySelectorAll('.param-enable').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = Number((e.target as HTMLElement).dataset.index);
        req.params[idx].enabled = (e.target as HTMLInputElement).checked;
        controller.saveState();
      });
    });

    paramsTableBody.querySelectorAll('.param-key').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number((e.target as HTMLElement).dataset.index);
        req.params[idx].key = (e.target as HTMLInputElement).value;
        controller.saveState();
      });
    });

    paramsTableBody.querySelectorAll('.param-value').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number((e.target as HTMLElement).dataset.index);
        req.params[idx].value = (e.target as HTMLInputElement).value;
        controller.saveState();
      });
    });

    paramsTableBody.querySelectorAll('.btn-remove-param').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number((btn as HTMLElement).dataset.index);
        req.params.splice(idx, 1);
        renderParamsTable();
        controller.saveState();
      });
    });
  }

  function renderHeadersTable() {
    if (!headersTableBody) return;
    const req = controller.getCurrentRequest();
    headersTableBody.innerHTML = '';

    if (req.headers.length === 0) {
      headersTableBody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-xs text-gray-400 dark:text-slate-500 italic">Nenhum cabeçalho configurado. Clique em "+ Adicionar Cabeçalho".</td></tr>`;
      return;
    }

    req.headers.forEach((header, index) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-gray-200 dark:border-slate-800 hover:bg-gray-50/50 dark:hover:bg-slate-900/50 transition-colors';
      tr.innerHTML = `
        <td class="p-2 text-center w-10">
          <input type="checkbox" class="header-enable rounded border-gray-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500" ${header.enabled ? 'checked' : ''} data-index="${index}" />
        </td>
        <td class="p-2">
          <input type="text" class="header-key w-full px-2 py-1 text-xs bg-transparent border border-gray-200 dark:border-slate-800 rounded text-gray-900 dark:text-slate-100 font-mono focus:border-indigo-500 focus:outline-none" value="${escapeHtml(header.key)}" placeholder="Header (ex: Authorization)" data-index="${index}" />
        </td>
        <td class="p-2">
          <input type="text" class="header-value w-full px-2 py-1 text-xs bg-transparent border border-gray-200 dark:border-slate-800 rounded text-gray-900 dark:text-slate-100 font-mono focus:border-indigo-500 focus:outline-none" value="${escapeHtml(header.value)}" placeholder="Valor ou {{var}}" data-index="${index}" />
        </td>
        <td class="p-2 text-center w-10">
          <button type="button" class="btn-remove-header text-gray-400 hover:text-red-500 p-1 transition-colors cursor-pointer" data-index="${index}" title="Remover">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </td>
      `;
      headersTableBody.appendChild(tr);
    });

    headersTableBody.querySelectorAll('.header-enable').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = Number((e.target as HTMLElement).dataset.index);
        req.headers[idx].enabled = (e.target as HTMLInputElement).checked;
        controller.saveState();
      });
    });

    headersTableBody.querySelectorAll('.header-key').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number((e.target as HTMLElement).dataset.index);
        req.headers[idx].key = (e.target as HTMLInputElement).value;
        controller.saveState();
      });
    });

    headersTableBody.querySelectorAll('.header-value').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number((e.target as HTMLElement).dataset.index);
        req.headers[idx].value = (e.target as HTMLInputElement).value;
        controller.saveState();
      });
    });

    headersTableBody.querySelectorAll('.btn-remove-header').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number((btn as HTMLElement).dataset.index);
        req.headers.splice(idx, 1);
        renderHeadersTable();
        controller.saveState();
      });
    });
  }

  function updateAuthPanes(type: string) {
    authPaneBearer?.classList.add('hidden');
    authPaneBasic?.classList.add('hidden');
    authPaneApiKey?.classList.add('hidden');

    if (type === 'bearer') authPaneBearer?.classList.remove('hidden');
    else if (type === 'basic') authPaneBasic?.classList.remove('hidden');
    else if (type === 'apikey') authPaneApiKey?.classList.remove('hidden');
  }

  // --- Renderização da Árvore de Coleções e Histórico ---
  interface FolderTreeNode {
    name: string;
    fullPath: string;
    subfolders: Map<string, FolderTreeNode>;
    requests: ApiRequestItem[];
  }

  function buildFolderTree(
    requests: ApiRequestItem[],
    explicitFolders: string[] = []
  ): { rootRequests: ApiRequestItem[]; rootFolders: Map<string, FolderTreeNode> } {
    const rootRequests: ApiRequestItem[] = [];
    const rootFolders = new Map<string, FolderTreeNode>();

    function getOrCreateNode(pathParts: string[]): FolderTreeNode {
      let currentMap = rootFolders;
      let accumulatedPath = '';
      let node: FolderTreeNode | null = null;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;

        if (!currentMap.has(part)) {
          const newNode: FolderTreeNode = {
            name: part,
            fullPath: accumulatedPath,
            subfolders: new Map(),
            requests: []
          };
          currentMap.set(part, newNode);
        }
        node = currentMap.get(part)!;
        currentMap = node.subfolders;
      }

      return node!;
    }

    for (const f of explicitFolders) {
      const parts = f.split(/[\/\\]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        getOrCreateNode(parts);
      }
    }

    for (const req of requests) {
      if (!req.folder || !req.folder.trim()) {
        rootRequests.push(req);
      } else {
        const parts = req.folder.split(/[\/\\]+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length === 0) {
          rootRequests.push(req);
        } else {
          const folderNode = getOrCreateNode(parts);
          folderNode.requests.push(req);
        }
      }
    }

    return { rootRequests, rootFolders };
  }

  function countRequestsInNode(node: FolderTreeNode): number {
    let count = node.requests.length;
    for (const sub of node.subfolders.values()) {
      count += countRequestsInNode(sub);
    }
    return count;
  }

  function renderCollectionsList(filter = '') {
    if (!collectionsList) return;
    const collections = controller.getCollections();
    const cleanFilter = filter.toLowerCase().trim();

    collectionsList.innerHTML = '';

    if (collections.length === 0) {
      collectionsList.innerHTML = `<div class="p-4 text-center text-xs text-gray-400 dark:text-slate-500 italic">Nenhuma coleção criada. Clique em "+ Coleção" para começar.</div>`;
      return;
    }

    function renderRequestItemHtml(colId: string, req: ApiRequestItem): string {
      const isCurrent = req.id === controller.getCurrentRequest().id;
      const methodClass = `http-method-${req.method.toLowerCase()}`;
      return `
        <div class="api-req-item group flex items-center justify-between px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800/80 cursor-pointer transition-colors rounded ${isCurrent ? 'bg-indigo-50 dark:bg-indigo-950/40 border-l-2 border-indigo-600 font-semibold' : ''}" data-col-id="${colId}" data-req-id="${req.id}">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <span class="http-method-badge ${methodClass} flex-shrink-0">${req.method}</span>
            <span class="api-req-name text-xs text-gray-800 dark:text-slate-200 truncate font-medium" title="${escapeHtml(req.name)}">${escapeHtml(req.name)}</span>
          </div>
          <button type="button" class="btn-del-req opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-opacity cursor-pointer flex-shrink-0" data-col-id="${colId}" data-req-id="${req.id}" title="Excluir Requisição">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
      `;
    }

    function renderFolderNodeHtml(col: ApiCollection, node: FolderTreeNode): string {
      const folderKey = `${col.id}::${node.fullPath}`;
      const totalInSubtree = countRequestsInNode(node);
      const isCollapsed = !cleanFilter && collapsedFolderKeys.has(folderKey);

      const subfoldersHtml = Array.from(node.subfolders.values())
        .map((sub) => renderFolderNodeHtml(col, sub))
        .join('');

      const requestsHtml = node.requests
        .map((req) => renderRequestItemHtml(col.id, req))
        .join('');

      const bodyContent = subfoldersHtml + requestsHtml || '<div class="py-1 px-2.5 text-[11px] text-gray-400 italic">Subpasta vazia</div>';

      return `
        <div class="subfolder-item ml-2 pl-1.5 border-l border-amber-300/40 dark:border-amber-700/30 mt-1">
          <div class="subfolder-header group/folder flex items-center justify-between py-1 px-1.5 hover:bg-gray-100 dark:hover:bg-slate-800/60 rounded cursor-pointer select-none transition-colors" data-col-id="${col.id}" data-folder-path="${escapeHtml(node.fullPath)}" title="Clique para ${isCollapsed ? 'expandir' : 'recolher'} subpasta">
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <svg class="folder-chevron w-3 h-3 text-gray-400 dark:text-slate-500 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '-rotate-90' : 'rotate-0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              <svg class="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
              </svg>
              <span class="text-xs font-semibold text-gray-700 dark:text-slate-300 truncate" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>
              <span class="text-[10px] text-gray-400 font-normal">(${totalInSubtree})</span>
            </div>
            <div class="flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity flex-shrink-0">
              <button type="button" class="btn-add-req-to-folder text-gray-400 hover:text-indigo-500 p-0.5 transition-colors cursor-pointer" data-col-id="${col.id}" data-folder-path="${escapeHtml(node.fullPath)}" title="Nova Requisição nesta subpasta">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
              </button>
              <button type="button" class="btn-add-subfolder text-gray-400 hover:text-amber-500 p-0.5 transition-colors cursor-pointer" data-col-id="${col.id}" data-parent-folder="${escapeHtml(node.fullPath)}" title="Nova Subpasta aqui dentro">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
              </button>
              <button type="button" class="btn-del-folder text-gray-400 hover:text-red-500 p-0.5 transition-colors cursor-pointer" data-col-id="${col.id}" data-folder-path="${escapeHtml(node.fullPath)}" title="Excluir Subpasta">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </div>
          <div class="subfolder-body ${isCollapsed ? 'hidden' : ''} space-y-0.5 mt-0.5">
            ${bodyContent}
          </div>
        </div>
      `;
    }

    collections.forEach((col) => {
      const filteredRequests = col.requests.filter(
        (r) =>
          !cleanFilter ||
          r.name.toLowerCase().includes(cleanFilter) ||
          r.url.toLowerCase().includes(cleanFilter) ||
          (r.folder && r.folder.toLowerCase().includes(cleanFilter))
      );

      if (cleanFilter && filteredRequests.length === 0 && !col.name.toLowerCase().includes(cleanFilter)) {
        return;
      }

      const isCollapsed = !cleanFilter && collapsedColIds.has(col.id);

      const tree = buildFolderTree(filteredRequests, cleanFilter ? [] : col.folders || []);

      const foldersHtml = Array.from(tree.rootFolders.values())
        .map((node) => renderFolderNodeHtml(col, node))
        .join('');

      const rootReqsHtml = tree.rootRequests
        .map((req) => renderRequestItemHtml(col.id, req))
        .join('');

      const bodyHtml = foldersHtml + rootReqsHtml || '<div class="p-2 text-center text-[11px] text-gray-400 italic">Nenhuma requisição nesta coleção</div>';

      const colEl = document.createElement('div');
      colEl.className = 'border border-gray-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-2xs transition-all';

      colEl.innerHTML = `
        <div class="col-header flex items-center justify-between px-2.5 py-2 bg-gray-50 dark:bg-slate-950 ${isCollapsed ? '' : 'border-b border-gray-200 dark:border-slate-800'} cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-900/80 transition-colors select-none" data-col-id="${col.id}" title="Clique para ${isCollapsed ? 'expandir' : 'recolher'} pasta">
          <div class="flex items-center gap-1.5 font-bold text-xs text-gray-700 dark:text-slate-300 truncate min-w-0">
            <svg class="col-chevron w-3.5 h-3.5 text-gray-400 dark:text-slate-500 transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '-rotate-90' : 'rotate-0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            <svg class="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              ${isCollapsed
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>'
                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path>'}
            </svg>
            <span class="truncate" title="${escapeHtml(col.name)}">${escapeHtml(col.name)}</span>
            <span class="text-[10px] text-gray-400 font-normal">(${col.requests.length})</span>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button type="button" class="btn-add-folder-to-col text-gray-400 hover:text-amber-500 p-1 transition-colors cursor-pointer" data-col-id="${col.id}" title="Adicionar Subpasta nesta Coleção">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
            </button>
            <button type="button" class="btn-add-req-to-col text-gray-400 hover:text-indigo-500 p-1 transition-colors cursor-pointer" data-col-id="${col.id}" title="Adicionar Requisição nesta Coleção">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            </button>
            <button type="button" class="btn-del-col text-gray-400 hover:text-red-500 p-1 transition-colors cursor-pointer" data-col-id="${col.id}" title="Excluir Coleção">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </div>
        <div class="col-body ${isCollapsed ? 'hidden' : ''} max-h-[32rem] overflow-y-auto api-scrollbar p-1.5 space-y-1">
          ${bodyHtml}
        </div>
      `;

      collectionsList.appendChild(colEl);
    });

    // Alternar Recolher/Expandir da Pasta ao clicar no cabeçalho da Coleção
    collectionsList.querySelectorAll('.col-header').forEach((hdr) => {
      hdr.addEventListener('click', (e) => {
        if (
          (e.target as HTMLElement).closest('.btn-add-req-to-col') ||
          (e.target as HTMLElement).closest('.btn-add-folder-to-col') ||
          (e.target as HTMLElement).closest('.btn-del-col')
        ) {
          return;
        }
        const colId = (hdr as HTMLElement).dataset.colId!;
        if (collapsedColIds.has(colId)) {
          collapsedColIds.delete(colId);
        } else {
          collapsedColIds.add(colId);
        }
        saveCollapsedState(collapsedColIds);
        renderCollectionsList(cleanFilter);
      });
    });

    // Alternar Recolher/Expandir de Subpastas
    collectionsList.querySelectorAll('.subfolder-header').forEach((hdr) => {
      hdr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const colId = (hdr as HTMLElement).dataset.colId!;
        const folderPath = (hdr as HTMLElement).dataset.folderPath!;
        const folderKey = `${colId}::${folderPath}`;
        if (collapsedFolderKeys.has(folderKey)) {
          collapsedFolderKeys.delete(folderKey);
        } else {
          collapsedFolderKeys.add(folderKey);
        }
        saveCollapsedFoldersState(collapsedFolderKeys);
        renderCollectionsList(cleanFilter);
      });
    });

    // Adicionar Subpasta na Raiz da Coleção
    collectionsList.querySelectorAll('.btn-add-folder-to-col').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const colId = (btn as HTMLElement).dataset.colId!;
        const folderName = await promptText(
          'Nova Subpasta',
          'Nome da subpasta:',
          '',
          'Ex: Homologação ou API Clientes'
        );
        if (folderName && folderName.trim()) {
          controller.addFolderToCollection(colId, folderName.trim());
          collapsedColIds.delete(colId);
          saveCollapsedState(collapsedColIds);
          renderCollectionsList(cleanFilter);
          showToast(`Subpasta "${folderName.trim()}" criada com sucesso!`, 'success');
        }
      });
    });

    // Adicionar Subpasta Aninhada dentro de outra Subpasta
    collectionsList.querySelectorAll('.btn-add-subfolder').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const colId = (btn as HTMLElement).dataset.colId!;
        const parentFolder = (btn as HTMLElement).dataset.parentFolder!;
        const folderName = await promptText(
          'Nova Subpasta',
          `Nome da subpasta dentro de "${parentFolder}":`,
          '',
          'Ex: API Cadastros'
        );
        if (folderName && folderName.trim()) {
          const newPath = `${parentFolder}/${folderName.trim()}`;
          controller.addFolderToCollection(colId, newPath);
          const parentKey = `${colId}::${parentFolder}`;
          collapsedFolderKeys.delete(parentKey);
          saveCollapsedFoldersState(collapsedFolderKeys);
          renderCollectionsList(cleanFilter);
          showToast(`Subpasta "${newPath}" criada com sucesso!`, 'success');
        }
      });
    });

    // Adicionar Requisição Dentro de uma Subpasta
    collectionsList.querySelectorAll('.btn-add-req-to-folder').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const colId = (btn as HTMLElement).dataset.colId!;
        const folderPath = (btn as HTMLElement).dataset.folderPath!;
        const name = await promptText(
          'Nova Requisição',
          `Nome da requisição em "${folderPath}":`,
          'Nova Consulta',
          'Ex: Obter Clientes'
        );
        if (name && name.trim()) {
          syncUIToRequest();
          const newReq = controller.createEmptyRequest();
          newReq.name = name.trim();
          newReq.collectionId = colId;
          newReq.folder = folderPath;
          controller.setCurrentRequest(newReq);
          controller.saveCurrentRequestToCollection(colId, name.trim(), folderPath);
          collapsedColIds.delete(colId);
          saveCollapsedState(collapsedColIds);
          const folderKey = `${colId}::${folderPath}`;
          collapsedFolderKeys.delete(folderKey);
          saveCollapsedFoldersState(collapsedFolderKeys);
          syncRequestToUI(newReq);
          renderCollectionsList(cleanFilter);
          showToast(`Requisição "${name.trim()}" criada em "${folderPath}"!`, 'success');
        }
      });
    });

    // Excluir Subpasta
    collectionsList.querySelectorAll('.btn-del-folder').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const colId = (btn as HTMLElement).dataset.colId!;
        const folderPath = (btn as HTMLElement).dataset.folderPath!;
        const ok = await confirmDialog({
          title: 'Excluir Subpasta',
          message: `Tem certeza que deseja excluir a subpasta "${folderPath}" e todas as requisições contidas nela?`,
          confirmText: 'Excluir Subpasta',
          isDanger: true
        });
        if (ok) {
          controller.deleteFolderFromCollection(colId, folderPath);
          renderCollectionsList(cleanFilter);
          showToast(`Subpasta "${folderPath}" excluída.`, 'info');
        }
      });
    });

    // Eventos nas requisições da lista
    collectionsList.querySelectorAll('.api-req-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-del-req')) return;
        const colId = (item as HTMLElement).dataset.colId;
        const reqId = (item as HTMLElement).dataset.reqId;
        const col = controller.getCollections().find((c) => c.id === colId);
        const req = col?.requests.find((r) => r.id === reqId);
        if (req) {
          syncUIToRequest(); // Salva alterações pendentes da requisição anterior antes de trocar
          controller.setCurrentRequest(JSON.parse(JSON.stringify(req)));
          syncRequestToUI(req);
          renderCollectionsList(cleanFilter);
        }
      });
    });

    // Excluir Requisição
    collectionsList.querySelectorAll('.btn-del-req').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const colId = (btn as HTMLElement).dataset.colId!;
        const reqId = (btn as HTMLElement).dataset.reqId!;
        const ok = await confirmDialog({
          title: 'Excluir Requisição',
          message: 'Deseja excluir esta requisição da coleção?',
          confirmText: 'Excluir',
          isDanger: true
        });
        if (ok) {
          controller.deleteRequestFromCollection(colId, reqId);
          renderCollectionsList(cleanFilter);
          showToast('Requisição excluída da coleção.', 'info');
        }
      });
    });

    // Adicionar Requisição na Coleção (Raiz)
    collectionsList.querySelectorAll('.btn-add-req-to-col').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const colId = (btn as HTMLElement).dataset.colId!;
        const name = await promptText('Nova Requisição', 'Nome da requisição:', 'Nova Consulta', 'Ex: Obter Clientes');
        if (name && name.trim()) {
          syncUIToRequest(); // Salva alterações pendentes antes de criar nova
          const newReq = controller.createEmptyRequest();
          newReq.name = name.trim();
          newReq.collectionId = colId;
          controller.setCurrentRequest(newReq);
          controller.saveCurrentRequestToCollection(colId, name.trim());
          collapsedColIds.delete(colId);
          saveCollapsedState(collapsedColIds);
          syncRequestToUI(newReq);
          renderCollectionsList(cleanFilter);
          showToast(`Requisição "${name.trim()}" adicionada com sucesso!`, 'success');
        }
      });
    });

    // Excluir Coleção
    collectionsList.querySelectorAll('.btn-del-col').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const colId = (btn as HTMLElement).dataset.colId!;
        const ok = await confirmDialog({
          title: 'Excluir Coleção',
          message: 'Tem certeza que deseja excluir toda esta coleção e todas as suas requisições?',
          confirmText: 'Excluir Coleção',
          isDanger: true
        });
        if (ok) {
          controller.deleteCollection(colId);
          renderCollectionsList(cleanFilter);
          showToast('Coleção excluída com sucesso.', 'info');
        }
      });
    });
  }

  function renderHistoryList() {
    if (!historyList) return;
    const history = controller.getHistory();
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = `<div class="p-4 text-center text-xs text-gray-400 dark:text-slate-500 italic">Nenhum histórico recente.</div>`;
      return;
    }

    history.forEach((h) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'p-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 cursor-pointer transition-colors';
      const statusClass = h.response
        ? h.response.status >= 200 && h.response.status < 300
          ? 'text-emerald-500 font-bold'
          : h.response.status >= 400
          ? 'text-rose-500 font-bold'
          : 'text-amber-500 font-bold'
        : 'text-gray-400';

      itemEl.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-1.5">
            <span class="http-method-badge http-method-${h.request.method.toLowerCase()}">${h.request.method}</span>
            <span class="text-xs font-mono ${statusClass}">${h.response ? h.response.status : 'ERR'}</span>
          </div>
          <span class="text-[10px] text-gray-400 font-mono">${new Date(h.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <div class="text-xs text-gray-800 dark:text-slate-200 font-mono truncate" title="${escapeHtml(h.request.url)}">${escapeHtml(h.request.url)}</div>
        ${h.response ? `<div class="text-[10px] text-gray-400 mt-1 flex items-center justify-between font-mono"><span>${h.response.durationMs} ms</span><span>${(h.response.sizeBytes / 1024).toFixed(1)} KB</span></div>` : ''}
      `;

      itemEl.addEventListener('click', () => {
        controller.setCurrentRequest(JSON.parse(JSON.stringify(h.request)));
        syncRequestToUI(h.request);
      });

      historyList.appendChild(itemEl);
    });
  }

  // --- Renderização da Resposta ---
  function renderResponse(res: ApiResponseData) {
    if (resLoadingState) resLoadingState.classList.add('hidden');
    if (resEmptyState) resEmptyState.classList.add('hidden');
    if (resContentArea) resContentArea.classList.remove('hidden');
    if (resStatusBar) resStatusBar.classList.remove('hidden');

    // Status Badge
    if (resStatusCodeBadge) {
      resStatusCodeBadge.textContent = `${res.status} ${res.statusText}`;
      resStatusCodeBadge.className = 'px-3 py-1 text-xs font-bold font-mono rounded-lg border';
      if (res.status >= 200 && res.status < 300) {
        resStatusCodeBadge.classList.add('http-status-2xx');
      } else if (res.status >= 300 && res.status < 400) {
        resStatusCodeBadge.classList.add('http-status-3xx');
      } else if (res.status >= 400 && res.status < 500) {
        resStatusCodeBadge.classList.add('http-status-4xx');
      } else {
        resStatusCodeBadge.classList.add('http-status-5xx');
      }
    }

    // Métricas
    if (resDuration) resDuration.textContent = `⏱️ ${res.durationMs} ms`;
    if (resSize) resSize.textContent = `📦 ${(res.sizeBytes / 1024).toFixed(2)} KB`;

    // Aviso de CORS se status = 0
    if (resCorsWarning) {
      if (res.isCorsError) {
        resCorsWarning.classList.remove('hidden');
      } else {
        resCorsWarning.classList.add('hidden');
      }
    }

    // Pretty Format
    if (resBodyPretty) {
      if (!res.body.trim()) {
        if (res.isCorsError) {
          resBodyPretty.innerHTML = `
            <div class="p-8 text-center text-amber-600 dark:text-amber-400 space-y-2">
              <div class="font-bold text-sm">Bloqueio de Segurança do Navegador (CORS / Mixed Content)</div>
              <div class="text-xs text-gray-500 dark:text-slate-400 max-w-md mx-auto">
                O navegador impediu a leitura dos dados retornados pelo servidor. Siga o passo a passo com a extensão recomendada no banner amarelo acima para liberar o acesso imediatamente.
              </div>
            </div>
          `;
        } else {
          resBodyPretty.innerHTML = '<span class="text-gray-400 italic">Corpo de resposta vazio.</span>';
        }
      } else {
        try {
          const parsedJson = JSON.parse(res.body);
          const prettyJson = JSON.stringify(parsedJson, null, 2);
          const highlighted = hljs.highlight(prettyJson, { language: 'json' }).value;
          resBodyPretty.innerHTML = highlighted;
        } catch {
          if (res.body.trim().startsWith('<')) {
            try {
              const highlighted = hljs.highlight(res.body, { language: 'xml' }).value;
              resBodyPretty.innerHTML = highlighted;
            } catch {
              resBodyPretty.textContent = res.body;
            }
          } else {
            resBodyPretty.textContent = res.body;
          }
        }
      }
    }

    // Raw Body
    if (resBodyRaw) resBodyRaw.value = res.body;

    // Headers da Resposta
    if (resHeadersTbody) {
      const headerKeys = Object.keys(res.headers);
      if (headerKeys.length === 0) {
        resHeadersTbody.innerHTML = `<tr><td colspan="2" class="p-3 text-center text-xs text-gray-400 italic">Nenhum cabeçalho retornado ou restrito pelo navegador.</td></tr>`;
      } else {
        resHeadersTbody.innerHTML = headerKeys.map((key) => `
          <tr class="border-b border-gray-200 dark:border-slate-800 font-mono text-xs">
            <td class="p-2 font-bold text-indigo-700 dark:text-indigo-400 w-1/3">${escapeHtml(key)}</td>
            <td class="p-2 text-gray-800 dark:text-slate-200 break-all">${escapeHtml(res.headers[key])}</td>
          </tr>
        `).join('');
      }
    }

    // Habilita botões de ação rápida de acordo com o conteúdo
    if (btnSendToXmlValidator) {
      btnSendToXmlValidator.classList.toggle('hidden', !res.body.trim().startsWith('<'));
    }
  }

  // --- Ambientes no Dropdown ---
  function updateEnvironmentsDropdown() {
    if (!activeEnvSelect) return;
    const envs = controller.getEnvironments();
    const activeEnv = controller.getActiveEnvironment();

    activeEnvSelect.innerHTML = '<option value="" class="bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">Sem Ambiente (Variáveis Globais)</option>';
    envs.forEach((env) => {
      const opt = document.createElement('option');
      opt.value = env.id;
      opt.textContent = env.name;
      opt.className = 'bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100';
      if (activeEnv && activeEnv.id === env.id) {
        opt.selected = true;
      }
      activeEnvSelect.appendChild(opt);
    });

    if (varsPopover && !varsPopover.classList.contains('hidden')) {
      renderVarsPopover();
    }
  }

  // --- Modal de Ambientes & Variáveis Globais ---
  function renderEnvsModal() {
    if (!envsListModal) return;
    const globals = controller.getGlobalVariables();
    const envs = controller.getEnvironments();
    envsListModal.innerHTML = '';

    // --- SEÇÃO 1: Variáveis Globais ---
    const globalsCard = document.createElement('div');
    globalsCard.className = 'p-4 rounded-xl border border-cyan-200 dark:border-cyan-800/60 bg-cyan-50/40 dark:bg-cyan-950/20 space-y-3';

    const globalRows = globals.map((g, i) => `
      <div class="flex items-center gap-2 p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/90 border border-cyan-100 dark:border-cyan-900/50 shadow-2xs">
        <button type="button" class="btn-copy-modal-var px-2 py-1 text-[11px] font-mono font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/80 dark:hover:bg-cyan-900 border border-cyan-200 dark:border-cyan-800 rounded transition-colors cursor-pointer shadow-2xs flex-shrink-0 flex items-center gap-1" data-key="${escapeHtml(g.key)}" title="Clique para copiar {{${escapeHtml(g.key)}}}">
          <span>{{${escapeHtml(g.key)}}}}</span>
          <svg class="w-3 h-3 text-cyan-600 dark:text-cyan-400 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
        </button>
        <input type="text" class="global-var-key flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500" value="${escapeHtml(g.key)}" placeholder="Nome (ex: baseUrlGlobal)" data-var-idx="${i}" />
        <input type="text" class="global-var-val flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500" value="${escapeHtml(g.value)}" placeholder="Valor padrão" data-var-idx="${i}" />
        <button type="button" class="btn-del-global-var p-1 text-gray-400 hover:text-red-500 cursor-pointer transition-colors" data-var-idx="${i}" title="Remover variável global">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
    `).join('');

    globalsCard.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-cyan-200/60 dark:border-cyan-800/50">
        <div class="flex items-center gap-2">
          <span class="text-base">🌍</span>
          <div>
            <h4 class="font-bold text-xs text-gray-900 dark:text-slate-100">Variáveis Globais do Projeto</h4>
            <p class="text-[10px] text-gray-500 dark:text-slate-400">Ativas em todos os ambientes e também quando "Sem Ambiente" estiver selecionado.</p>
          </div>
        </div>
        <button type="button" id="btn-add-global-var" class="px-2.5 py-1 text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/60 hover:bg-cyan-200 dark:hover:bg-cyan-800/80 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          <span>Nova Global</span>
        </button>
      </div>
      <div class="space-y-1.5">
        ${globalRows || '<div class="text-[11px] text-gray-400 dark:text-slate-500 italic p-3 text-center">Nenhuma variável global configurada. Clique em "+ Nova Global" para adicionar.</div>'}
      </div>
    `;
    envsListModal.appendChild(globalsCard);

    // Divisor de Seção
    const divider = document.createElement('div');
    divider.className = 'pt-2 pb-1 flex items-center gap-2';
    divider.innerHTML = `
      <div class="h-px bg-gray-200 dark:bg-slate-800 flex-1"></div>
      <span class="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
        <span>🏢 Ambientes Específicos</span>
        <span class="text-[10px] font-normal lowercase text-gray-400">(${envs.length})</span>
      </span>
      <div class="h-px bg-gray-200 dark:bg-slate-800 flex-1"></div>
    `;
    envsListModal.appendChild(divider);

    // --- SEÇÃO 2: Ambientes Específicos ---
    if (envs.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'p-4 rounded-xl border border-dashed border-gray-300 dark:border-slate-800 text-center text-xs text-gray-400 italic';
      emptyCard.textContent = 'Nenhum ambiente específico cadastrado. Você pode criar um clicando em "+ Novo Ambiente" abaixo.';
      envsListModal.appendChild(emptyCard);
    } else {
      envs.forEach((env) => {
        const card = document.createElement('div');
        card.className = 'p-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3';

        const varsRows = env.variables.map((v, i) => `
          <div class="flex items-center gap-2 p-1 rounded-lg bg-gray-50/60 dark:bg-slate-950/60 border border-gray-200/70 dark:border-slate-800">
            <button type="button" class="btn-copy-modal-var px-2 py-1 text-[11px] font-mono font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/80 dark:hover:bg-cyan-900 border border-cyan-200 dark:border-cyan-800 rounded transition-colors cursor-pointer shadow-2xs flex-shrink-0 flex items-center gap-1" data-key="${escapeHtml(v.key)}" title="Clique para copiar {{${escapeHtml(v.key)}}}">
              <span>{{${escapeHtml(v.key)}}}}</span>
              <svg class="w-3 h-3 text-cyan-600 dark:text-cyan-400 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            </button>
            <input type="text" class="env-var-key flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded text-gray-900 dark:text-slate-100" value="${escapeHtml(v.key)}" placeholder="Nome (ex: baseUrl)" data-env-id="${env.id}" data-var-idx="${i}" />
            <input type="text" class="env-var-val flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded text-gray-900 dark:text-slate-100" value="${escapeHtml(v.value)}" placeholder="Valor" data-env-id="${env.id}" data-var-idx="${i}" />
            <button type="button" class="btn-del-env-var p-1 text-gray-400 hover:text-red-500 cursor-pointer" data-env-id="${env.id}" data-var-idx="${i}" title="Remover variável">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        `).join('');

        card.innerHTML = `
          <div class="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-slate-800">
            <input type="text" class="env-name-input font-bold text-sm bg-transparent border-b border-transparent hover:border-gray-400 text-gray-800 dark:text-slate-100 focus:outline-none" value="${escapeHtml(env.name)}" data-env-id="${env.id}" />
            <div class="flex items-center gap-2">
              <button type="button" class="btn-add-var-to-env text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer" data-env-id="${env.id}">+ Variável</button>
              <button type="button" class="btn-del-entire-env text-xs text-red-500 hover:underline cursor-pointer" data-env-id="${env.id}">Excluir</button>
            </div>
          </div>
          <div class="space-y-2">
            ${varsRows || '<div class="text-[11px] text-gray-400 italic">Nenhuma variável configurada neste ambiente.</div>'}
          </div>
        `;

        envsListModal.appendChild(card);
      });
    }

    // Eventos nas Globais
    envsListModal.querySelector('#btn-add-global-var')?.addEventListener('click', () => {
      controller.addGlobalVariable('novaGlobal', '');
      renderEnvsModal();
      updateUrlResolvedPreview();
    });

    envsListModal.querySelectorAll('.global-var-key').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number((e.target as HTMLElement).dataset.varIdx);
        const globalsList = controller.getGlobalVariables();
        if (globalsList[idx]) {
          globalsList[idx].key = (e.target as HTMLInputElement).value;
          controller.saveState();
          updateUrlResolvedPreview();
        }
      });
    });

    envsListModal.querySelectorAll('.global-var-val').forEach((input) => {
      input.addEventListener('input', (e) => {
        const idx = Number((e.target as HTMLElement).dataset.varIdx);
        const globalsList = controller.getGlobalVariables();
        if (globalsList[idx]) {
          globalsList[idx].value = (e.target as HTMLInputElement).value;
          controller.saveState();
          updateUrlResolvedPreview();
        }
      });
    });

    envsListModal.querySelectorAll('.btn-del-global-var').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number((btn as HTMLElement).dataset.varIdx);
        controller.deleteGlobalVariable(idx);
        renderEnvsModal();
        updateUrlResolvedPreview();
      });
    });

    // Copiar variável pelo botão do modal
    envsListModal.querySelectorAll('.btn-copy-modal-var').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLElement).dataset.key;
        if (!key) return;
        const token = `{{${key}}}`;
        navigator.clipboard.writeText(token).then(() => {
          showToast(`Variável ${token} copiada para a área de transferência!`, 'success');
        });
      });
    });

    // Eventos nos Ambientes
    envsListModal.querySelectorAll('.env-name-input').forEach((input) => {
      input.addEventListener('input', (e) => {
        const envId = (e.target as HTMLElement).dataset.envId!;
        const env = controller.getEnvironments().find((x) => x.id === envId);
        if (env) {
          env.name = (e.target as HTMLInputElement).value;
          controller.saveState();
          updateEnvironmentsDropdown();
        }
      });
    });

    envsListModal.querySelectorAll('.env-var-key').forEach((input) => {
      input.addEventListener('input', (e) => {
        const envId = (e.target as HTMLElement).dataset.envId!;
        const idx = Number((e.target as HTMLElement).dataset.varIdx);
        const env = controller.getEnvironments().find((x) => x.id === envId);
        if (env) {
          env.variables[idx].key = (e.target as HTMLInputElement).value;
          controller.saveState();
          updateUrlResolvedPreview();
        }
      });
    });

    envsListModal.querySelectorAll('.env-var-val').forEach((input) => {
      input.addEventListener('input', (e) => {
        const envId = (e.target as HTMLElement).dataset.envId!;
        const idx = Number((e.target as HTMLElement).dataset.varIdx);
        const env = controller.getEnvironments().find((x) => x.id === envId);
        if (env) {
          env.variables[idx].value = (e.target as HTMLInputElement).value;
          controller.saveState();
          updateUrlResolvedPreview();
        }
      });
    });

    envsListModal.querySelectorAll('.btn-del-env-var').forEach((btn) => {
      btn.addEventListener('click', () => {
        const envId = (btn as HTMLElement).dataset.envId!;
        const idx = Number((btn as HTMLElement).dataset.varIdx);
        const env = controller.getEnvironments().find((x) => x.id === envId);
        if (env) {
          env.variables.splice(idx, 1);
          renderEnvsModal();
          controller.saveState();
          updateUrlResolvedPreview();
        }
      });
    });

    envsListModal.querySelectorAll('.btn-add-var-to-env').forEach((btn) => {
      btn.addEventListener('click', () => {
        const envId = (btn as HTMLElement).dataset.envId!;
        const env = controller.getEnvironments().find((x) => x.id === envId);
        if (env) {
          env.variables.push({ key: 'novaVariavel', value: '', enabled: true });
          renderEnvsModal();
          controller.saveState();
          updateUrlResolvedPreview();
        }
      });
    });

    envsListModal.querySelectorAll('.btn-del-entire-env').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const envId = (btn as HTMLElement).dataset.envId!;
        const ok = await confirmDialog({
          title: 'Excluir Ambiente',
          message: 'Deseja realmente excluir este ambiente de variáveis?',
          confirmText: 'Excluir',
          isDanger: true
        });
        if (ok) {
          controller.deleteEnvironment(envId);
          renderEnvsModal();
          updateEnvironmentsDropdown();
          updateUrlResolvedPreview();
          showToast('Ambiente excluído com sucesso.', 'info');
        }
      });
    });
  }

  // --- Popover Seletor e Copiador de Variáveis de Ambiente ---
  let varsPopoverOpenedByTyping = false;

  function copyVariableToken(key: string) {
    const token = `{{${key}}}`;
    navigator.clipboard.writeText(token).then(() => {
      showToast(`Variável ${token} copiada para a área de transferência!`, 'success');
    });
  }

  function insertVariableIntoUrl(key: string) {
    if (!urlInput) return;
    const token = `{{${key}}}`;
    const start = urlInput.selectionStart ?? urlInput.value.length;
    const end = urlInput.selectionEnd ?? urlInput.value.length;
    const currentVal = urlInput.value;

    const textBefore = currentVal.substring(0, start);
    const match = textBefore.match(/\{\{([a-zA-Z0-9_-]*)$/);

    let newUrl: string;
    let newCursorPos: number;

    if (match) {
      const replaceStart = start - match[0].length;
      newUrl = currentVal.substring(0, replaceStart) + token + currentVal.substring(end);
      newCursorPos = replaceStart + token.length;
    } else {
      newUrl = currentVal.substring(0, start) + token + currentVal.substring(end);
      newCursorPos = start + token.length;
    }

    urlInput.value = newUrl;
    urlInput.focus();
    urlInput.setSelectionRange(newCursorPos, newCursorPos);
    urlInput.dispatchEvent(new Event('input'));
    hideVarsPopover();
    showToast(`Variável ${token} inserida na URL!`, 'success', 2000);
  }

  function renderVarsPopover(filterText = '') {
    if (!varsPopover) return;
    const activeEnv = controller.getActiveEnvironment();
    let varsToShow = controller.getActiveVariables();

    const cleanFilter = filterText.toLowerCase().trim();
    if (cleanFilter) {
      varsToShow = varsToShow.filter(
        (v) => v.key.toLowerCase().includes(cleanFilter) || v.value.toLowerCase().includes(cleanFilter)
      );
    }

    const envLabel = activeEnv
      ? `🏢 ${escapeHtml(activeEnv.name)} <span class="text-gray-400 font-normal text-[10px]">(+ Globais)</span>`
      : '🌍 Apenas Globais (Sem Ambiente)';

    const listHtml =
      varsToShow.length > 0
        ? varsToShow
            .map(
              (v) => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-slate-950/80 border border-gray-200 dark:border-slate-800 hover:border-cyan-400 dark:hover:border-cyan-600 transition-colors group">
            <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-3 cursor-pointer btn-var-card-click" data-key="${escapeHtml(v.key)}" title="Clique para inserir na URL">
              <span class="px-2.5 py-1 text-xs font-mono font-bold bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 rounded-lg border border-cyan-200 dark:border-cyan-800 flex-shrink-0">
                {{${escapeHtml(v.key)}}}
              </span>
              <span class="text-xs text-gray-600 dark:text-slate-400 font-mono truncate" title="${escapeHtml(v.value)}">
                = "${escapeHtml(v.value || '(vazio)')}"
              </span>
              <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                v.isGlobal
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-medium'
                  : 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-medium'
              }">
                ${v.isGlobal ? '🌍 Global' : `🏢 ${escapeHtml(v.envName)}`}
              </span>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button type="button" class="btn-var-insert px-2.5 py-1 text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1" data-key="${escapeHtml(v.key)}" title="Inserir {{${escapeHtml(v.key)}}} na URL">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                <span>Inserir</span>
              </button>
              <button type="button" class="btn-var-copy px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1" data-key="${escapeHtml(v.key)}" title="Copiar {{${escapeHtml(v.key)}}}">
                <svg class="w-3 h-3 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                <span>Copiar</span>
              </button>
            </div>
          </div>
        `
            )
            .join('')
        : `
          <div class="p-6 text-center text-xs text-gray-500 dark:text-slate-400 space-y-2">
            <div>${cleanFilter ? 'Nenhuma variável correspondente encontrada.' : activeEnv ? 'Nenhuma variável disponível neste ambiente nem nas variáveis globais.' : 'Nenhuma variável global cadastrada. Cadastre variáveis globais para usar em qualquer lugar ou selecione um ambiente.'}</div>
            <div>
              <button type="button" id="btn-empty-manage-envs" class="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer">+ Cadastrar Variáveis Globais / Ambientes</button>
            </div>
          </div>
        `;

    varsPopover.innerHTML = `
      <div class="flex items-center justify-between pb-2.5 border-b border-gray-100 dark:border-slate-800">
        <div class="flex items-center gap-2">
          <div class="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 font-mono font-bold text-xs">
            { }
          </div>
          <div>
            <h4 class="font-bold text-xs text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>Variáveis Disponíveis</span>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300">${varsToShow.length} disponível(is)</span>
            </h4>
            <p class="text-[11px] text-gray-500 dark:text-slate-400">Escopo Atual: <span class="font-semibold text-cyan-600 dark:text-cyan-400">${envLabel}</span></p>
          </div>
        </div>
        <button type="button" id="btn-close-vars-popover" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold p-1 cursor-pointer leading-none">&times;</button>
      </div>

      <div class="pt-2.5 space-y-2">
        <div class="relative">
          <svg class="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <input type="text" id="api-vars-search-input" value="${escapeHtml(filterText)}" placeholder="Filtrar por nome ou valor da variável..." class="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono" />
        </div>

        <div class="max-h-56 overflow-y-auto space-y-1.5 pr-1 api-scrollbar">
          ${listHtml}
        </div>
      </div>

      <div class="pt-2.5 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-400 flex-wrap gap-2">
        <span>💡 Clique no nome ou em <strong>Inserir</strong> para colocar na URL, ou em <strong>Copiar</strong> para Headers/Body.</span>
        <button type="button" id="btn-popover-open-envs" class="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          Gerenciar Ambientes & Globais
        </button>
      </div>
    `;

    varsPopover.querySelector('#btn-close-vars-popover')?.addEventListener('click', hideVarsPopover);
    varsPopover.querySelector('#btn-popover-open-envs')?.addEventListener('click', () => {
      hideVarsPopover();
      btnManageEnvs?.click();
    });
    varsPopover.querySelector('#btn-empty-manage-envs')?.addEventListener('click', () => {
      hideVarsPopover();
      btnManageEnvs?.click();
    });

    const searchInp = varsPopover.querySelector('#api-vars-search-input') as HTMLInputElement | null;
    searchInp?.addEventListener('input', () => {
      renderVarsPopover(searchInp.value);
      const updatedSearch = varsPopover.querySelector('#api-vars-search-input') as HTMLInputElement | null;
      if (updatedSearch) {
        updatedSearch.focus();
        updatedSearch.setSelectionRange(updatedSearch.value.length, updatedSearch.value.length);
      }
    });

    varsPopover.querySelectorAll('.btn-var-insert, .btn-var-card-click').forEach((el) => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.key;
        if (key) insertVariableIntoUrl(key);
      });
    });

    varsPopover.querySelectorAll('.btn-var-copy').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = (btn as HTMLElement).dataset.key;
        if (key) copyVariableToken(key);
      });
    });
  }

  function showVarsPopover(filterText = '') {
    if (!varsPopover) return;
    renderVarsPopover(filterText);
    varsPopover.classList.remove('hidden');
    const searchInp = varsPopover.querySelector('#api-vars-search-input') as HTMLInputElement | null;
    if (searchInp && !filterText) {
      searchInp.focus();
    }
  }

  function hideVarsPopover() {
    if (!varsPopover) return;
    varsPopover.classList.add('hidden');
    varsPopoverOpenedByTyping = false;
  }

  // --- Prévia da URL Resolvida em Tempo Real ---
  function updateUrlResolvedPreview() {
    if (!urlResolvedPreview || !urlResolvedText || !urlResolvedStatus || !urlInput) return;
    const url = urlInput.value.trim();

    if (!url || !url.includes('{{')) {
      urlResolvedPreview.classList.add('hidden');
      return;
    }

    urlResolvedPreview.classList.remove('hidden');
    const resolved = controller.interpolate(url);
    urlResolvedText.textContent = resolved;
    urlResolvedText.title = resolved;

    const unresolvedMatch = resolved.match(/\{\{([^{}]+)\}\}/g);
    if (unresolvedMatch && unresolvedMatch.length > 0) {
      urlResolvedStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 flex items-center gap-1';
      urlResolvedStatus.innerHTML = `⚠️ ${unresolvedMatch.length} não resolvida(s)`;
      urlResolvedStatus.title = `As seguintes variáveis não foram encontradas no escopo ativo: ${unresolvedMatch.join(', ')}`;
    } else {
      urlResolvedStatus.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1';
      urlResolvedStatus.innerHTML = `✓ Pronta para envio`;
      urlResolvedStatus.title = 'Todas as variáveis foram resolvidas com sucesso no escopo ativo.';
    }
  }

  // --- Tooltip Flutuante de Inspeção de Variáveis na URL ao Passar o Mouse ---
  let canvasMeasureCtx: CanvasRenderingContext2D | null = null;
  function getCharWidth(): number {
    if (!urlInput) return 7.2;
    if (!canvasMeasureCtx) {
      const canvas = document.createElement('canvas');
      canvasMeasureCtx = canvas.getContext('2d');
    }
    if (canvasMeasureCtx) {
      const style = window.getComputedStyle(urlInput);
      canvasMeasureCtx.font = `${style.fontSize} ${style.fontFamily || 'monospace'}`;
      const w = canvasMeasureCtx.measureText('M').width;
      if (w > 0) return w;
    }
    return 7.2;
  }

  function hideUrlVarTooltip() {
    if (urlVarTooltip) {
      urlVarTooltip.classList.add('hidden');
    }
  }

  urlInput?.addEventListener('mousemove', (e: MouseEvent) => {
    if (!urlVarTooltip || !urlInput) return;
    const val = urlInput.value;
    if (!val.includes('{{')) {
      hideUrlVarTooltip();
      return;
    }

    const style = window.getComputedStyle(urlInput);
    const paddingLeft = parseFloat(style.paddingLeft) || 12;
    const rect = urlInput.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - paddingLeft + urlInput.scrollLeft;

    if (mouseX < 0) {
      hideUrlVarTooltip();
      return;
    }

    const charWidth = getCharWidth();
    const charIndex = Math.floor(mouseX / charWidth);

    const regex = /\{\{([^{}]+)\}\}/g;
    let match: RegExpExecArray | null;
    let foundToken: { name: string; full: string; start: number; end: number } | null = null;

    while ((match = regex.exec(val)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (charIndex >= start && charIndex < end) {
        foundToken = {
          name: match[1].trim(),
          full: match[0],
          start,
          end
        };
        break;
      }
    }

    if (!foundToken) {
      hideUrlVarTooltip();
      return;
    }

    const activeVars = controller.getActiveVariables();
    const activeVar = activeVars.find((v) => v.key === foundToken!.name);

    if (activeVar) {
      const scopeBadge = activeVar.isGlobal
        ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">🌍 Global</span>`
        : `<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1">🏢 ${escapeHtml(activeVar.envName)}</span>`;

      urlVarTooltip.innerHTML = `
        <div class="flex items-center justify-between gap-3 border-b border-slate-700/80 pb-1.5">
          <span class="font-mono font-bold text-cyan-400 text-xs">{{${escapeHtml(activeVar.key)}}}</span>
          ${scopeBadge}
        </div>
        <div class="pt-1 text-[11px] font-mono break-all">
          <span class="text-slate-400 select-none">Valor resolvido: </span>
          <span class="text-emerald-400 font-semibold">${escapeHtml(activeVar.value || '(vazio)')}</span>
        </div>
        <div class="text-[10px] text-slate-400 italic">
          ${activeVar.isGlobal ? 'Definida nas variáveis globais do projeto.' : `Definida no ambiente "${escapeHtml(activeVar.envName)}".`}
        </div>
      `;
    } else {
      const activeEnv = controller.getActiveEnvironment();
      const envHint = activeEnv ? `no ambiente "${escapeHtml(activeEnv.name)}" nem nas globais` : `nas variáveis globais (nenhum ambiente selecionado)`;

      urlVarTooltip.innerHTML = `
        <div class="flex items-center justify-between gap-3 border-b border-rose-800/80 pb-1.5">
          <span class="font-mono font-bold text-rose-400 text-xs">{{${escapeHtml(foundToken.name)}}}</span>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">⚠️ Não Definida</span>
        </div>
        <div class="pt-1 text-[11px] text-rose-200">
          Esta variável não existe ${envHint}.
        </div>
        <div class="text-[10px] text-slate-400 pt-0.5">
          Dica: Selecione o ambiente correto no combo ou cadastre-a em <strong>Gerenciar Ambientes</strong>.
        </div>
      `;
    }

    urlVarTooltip.classList.remove('hidden');

    const tooltipWidth = 320;
    let posX = e.clientX - 60;
    if (posX + tooltipWidth > window.innerWidth - 16) {
      posX = window.innerWidth - tooltipWidth - 16;
    }
    if (posX < 16) posX = 16;

    const posY = rect.bottom + 8;
    urlVarTooltip.style.left = `${posX}px`;
    urlVarTooltip.style.top = `${posY}px`;
  });

  urlInput?.addEventListener('mouseleave', hideUrlVarTooltip);
  urlInput?.addEventListener('blur', hideUrlVarTooltip);
  window.addEventListener('scroll', hideUrlVarTooltip, true);

  // --- Snippet Modal ---
  function updateSnippetModal() {
    if (!snippetContent || !snippetLangSelect) return;
    const lang = (snippetLangSelect.value || 'curl') as any;
    const code = controller.generateSnippet(controller.getCurrentRequest(), lang);
    const highlighted = hljs.highlightAuto(code).value;
    snippetContent.innerHTML = `<pre><code class="hljs">${highlighted}</code></pre>`;
  }

  // --- Event Listeners Globais ---

  // Disparo da Requisição (Send)
  async function handleSend() {
    syncUIToRequest();
    if (!urlInput?.value.trim()) {
      showToast('Por favor, informe a URL da requisição.', 'warning');
      urlInput?.focus();
      return;
    }

    const currentUrl = urlInput.value.trim();
    const resolvedUrl = controller.interpolate(currentUrl);

    // Validação 1: Detecta variáveis não resolvidas (ex: {{ServerIISPWI}})
    const unresolvedMatch = resolvedUrl.match(/\{\{([^{}]+)\}\}/);
    if (unresolvedMatch) {
      const activeEnv = controller.getActiveEnvironment();
      const envName = activeEnv ? `"${activeEnv.name}"` : 'nenhum ambiente selecionado';
      showToast(
        `A variável ${unresolvedMatch[0]} não foi encontrada no ambiente ativo (${envName}). Verifique o combo de ambientes ou o cadastro de variáveis.`,
        'warning',
        6000
      );
      return;
    }

    // Validação 2: Detecta URL sem protocolo HTTP/HTTPS
    if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
      showToast(
        'A URL precisa começar com http:// ou https:// (ex: http://meuservidor:8080/api). Sem isso, o navegador tentará buscar dentro do próprio site.',
        'warning',
        6000
      );
      return;
    }

    if (resLoadingState) resLoadingState.classList.remove('hidden');
    if (resEmptyState) resEmptyState.classList.add('hidden');
    if (resContentArea) resContentArea.classList.add('hidden');
    if (resCorsWarning) resCorsWarning.classList.add('hidden');

    btnSend?.classList.add('hidden');
    btnCancel?.classList.remove('hidden');

    const res = await controller.executeCurrentRequest();

    btnSend?.classList.remove('hidden');
    btnCancel?.classList.add('hidden');

    renderResponse(res);
    renderHistoryList();
  }

  btnSend?.addEventListener('click', handleSend);
  btnCancel?.addEventListener('click', () => {
    controller.cancelCurrentRequest();
    btnSend?.classList.remove('hidden');
    btnCancel?.classList.add('hidden');
    if (resLoadingState) resLoadingState.classList.add('hidden');
  });

  // Atalho de Teclado Ctrl + Enter para enviar e Ctrl + S para salvar
  window.addEventListener('keydown', (e) => {
    const isApiTesterActive = !document.getElementById('section-api-tester')?.classList.contains('hidden');
    if (isApiTesterActive && e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    } else if (isApiTesterActive && e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      btnSaveToCol?.click();
    }
  });

  // Mudança de Método HTTP
  methodSelect?.addEventListener('change', () => {
    updateMethodSelectColor(methodSelect.value);
    syncUIToRequest();
    const currentReq = controller.getCurrentRequest();
    if (currentReq.id) {
      const badgeEl = collectionsList?.querySelector(`.api-req-item[data-req-id="${currentReq.id}"] .http-method-badge`);
      if (badgeEl) {
        badgeEl.textContent = currentReq.method;
        badgeEl.className = `http-method-badge http-method-${currentReq.method.toLowerCase()}`;
      }
    }
  });

  // Inputs básicos e Autocomplete de Variáveis {{...}}
  urlInput?.addEventListener('input', () => {
    syncUIToRequest();
    const cursorPos = urlInput.selectionStart ?? urlInput.value.length;
    const textBefore = urlInput.value.substring(0, cursorPos);
    const match = textBefore.match(/\{\{([a-zA-Z0-9_-]*)$/);
    if (match) {
      varsPopoverOpenedByTyping = true;
      showVarsPopover(match[1]);
    } else if (varsPopoverOpenedByTyping) {
      hideVarsPopover();
    }
  });

  // Botão Inserir/Selecionar Variáveis {{x}}
  btnVarsPicker?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (varsPopover?.classList.contains('hidden')) {
      showVarsPopover();
    } else {
      hideVarsPopover();
    }
  });

  // Fechar popover de variáveis ao clicar fora
  window.addEventListener('click', (e) => {
    if (varsPopover && !varsPopover.classList.contains('hidden')) {
      const target = e.target as HTMLElement;
      if (
        !varsPopover.contains(target) &&
        !btnVarsPicker?.contains(target) &&
        target !== urlInput
      ) {
        hideVarsPopover();
      }
    }
  });

  // Fechar popover com Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && varsPopover && !varsPopover.classList.contains('hidden')) {
      hideVarsPopover();
    }
  });

  requestNameInput?.addEventListener('input', () => {
    syncUIToRequest();
    const currentReq = controller.getCurrentRequest();
    if (currentReq.id) {
      const nameEl = collectionsList?.querySelector(`.api-req-item[data-req-id="${currentReq.id}"] .api-req-name`);
      if (nameEl) nameEl.textContent = currentReq.name;
    }
  });

  // Adicionar Parâmetro & Header
  btnAddParam?.addEventListener('click', () => {
    const req = controller.getCurrentRequest();
    req.params.push({ id: uid(), key: '', value: '', enabled: true });
    renderParamsTable();
    controller.saveState();
  });

  btnAddHeader?.addEventListener('click', () => {
    const req = controller.getCurrentRequest();
    req.headers.push({ id: uid(), key: '', value: '', enabled: true });
    renderHeadersTable();
    controller.saveState();
  });

  // Alternador de Abas de Configuração da Requisição
  reqTabs.forEach((tab) => {
    reqTabBtns[tab]?.addEventListener('click', () => {
      reqTabs.forEach((t) => {
        reqTabBtns[t]?.classList.remove('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
        reqTabBtns[t]?.classList.add('border-transparent', 'text-gray-500', 'dark:text-slate-400');
        reqTabPanes[t]?.classList.add('hidden');
      });
      reqTabBtns[tab]?.classList.add('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
      reqTabBtns[tab]?.classList.remove('border-transparent', 'text-gray-500', 'dark:text-slate-400');
      reqTabPanes[tab]?.classList.remove('hidden');
    });
  });

  // Mudança de Tipo de Autenticação
  authTypeSelect?.addEventListener('change', () => {
    updateAuthPanes(authTypeSelect.value);
    syncUIToRequest();
  });
  [authBearerTokenInput, authBasicUserInput, authBasicPassInput, authApiKeyNameInput, authApiKeyValueInput, authApiKeyLocationSelect].forEach((inp) => {
    inp?.addEventListener('input', syncUIToRequest);
  });

  // Mudança de Tipo de Body
  bodyTypeSelect?.addEventListener('change', () => {
    syncUIToRequest();
  });
  bodyContentTextarea?.addEventListener('input', syncUIToRequest);

  // Formatar Body JSON/XML
  btnFormatBody?.addEventListener('click', () => {
    if (!bodyContentTextarea) return;
    const content = bodyContentTextarea.value.trim();
    if (!content) return;

    if (bodyTypeSelect?.value === 'json') {
      try {
        const parsed = JSON.parse(content);
        bodyContentTextarea.value = JSON.stringify(parsed, null, 2);
        syncUIToRequest();
        showToast('JSON formatado com sucesso!', 'success');
      } catch {
        showToast('JSON inválido. Não foi possível formatar.', 'error');
      }
    }
  });

  // Alternador de Abas de Resposta
  (['pretty', 'raw', 'headers'] as const).forEach((t) => {
    resTabBtns[t]?.addEventListener('click', () => {
      (['pretty', 'raw', 'headers'] as const).forEach((other) => {
        resTabBtns[other]?.classList.remove('bg-indigo-600', 'text-white', 'dark:bg-indigo-500');
        resTabBtns[other]?.classList.add('text-gray-600', 'dark:text-slate-400');
        resTabPanes[other]?.classList.add('hidden');
      });
      resTabBtns[t]?.classList.add('bg-indigo-600', 'text-white', 'dark:bg-indigo-500');
      resTabBtns[t]?.classList.remove('text-gray-600', 'dark:text-slate-400');
      resTabPanes[t]?.classList.remove('hidden');
    });
  });

  // Copiar Resposta
  btnCopyRes?.addEventListener('click', () => {
    const res = controller.getLastResponse();
    if (!res || !res.body) return;
    navigator.clipboard.writeText(res.body).then(() => {
      showToast('Resposta copiada para a área de transferência!', 'success');
    });
  });

  // Baixar Resposta
  btnDownloadRes?.addEventListener('click', () => {
    const res = controller.getLastResponse();
    if (!res || !res.body) return;
    const isJson = res.body.trim().startsWith('{') || res.body.trim().startsWith('[');
    const isXml = res.body.trim().startsWith('<');
    const ext = isJson ? '.json' : isXml ? '.xml' : '.txt';
    const blob = new Blob([res.body], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `resposta-api${ext}`);
  });

  // Ações de Sinergia com Outras Ferramentas do Comparador
  btnSendToXmlValidator?.addEventListener('click', () => {
    const res = controller.getLastResponse();
    if (!res || !res.body) return;
    const tabXml = document.getElementById('tab-xml-validator') as HTMLButtonElement | null;
    const inputXml = document.getElementById('xml-input') as HTMLTextAreaElement | null;
    if (tabXml && inputXml) {
      inputXml.value = res.body;
      tabXml.click();
    }
  });

  btnSendToBeautifier?.addEventListener('click', () => {
    const res = controller.getLastResponse();
    if (!res || !res.body) return;
    const tabBeautifier = document.getElementById('tab-beautifier') as HTMLButtonElement | null;
    const inputBeautifier = document.getElementById('beautifier-input') as HTMLTextAreaElement | null;
    if (tabBeautifier && inputBeautifier) {
      inputBeautifier.value = res.body;
      tabBeautifier.click();
    }
  });

  btnSendToComparator?.addEventListener('click', () => {
    const res = controller.getLastResponse();
    if (!res || !res.body) return;
    const tabText = document.getElementById('tab-text') as HTMLButtonElement | null;
    const textAfter = document.getElementById('text-after') as HTMLTextAreaElement | null;
    if (tabText && textAfter) {
      textAfter.value = res.body;
      tabText.click();
    }
  });

  // Sidebar Tabs (Coleções vs Histórico)
  tabSidebarCols?.addEventListener('click', () => {
    tabSidebarCols.classList.add('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    tabSidebarCols.classList.remove('border-transparent', 'text-gray-500');
    tabSidebarHist?.classList.remove('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    tabSidebarHist?.classList.add('border-transparent', 'text-gray-500');
    paneSidebarCols?.classList.remove('hidden');
    paneSidebarHist?.classList.add('hidden');
  });

  tabSidebarHist?.addEventListener('click', () => {
    tabSidebarHist.classList.add('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    tabSidebarHist.classList.remove('border-transparent', 'text-gray-500');
    tabSidebarCols?.classList.remove('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    tabSidebarCols?.classList.add('border-transparent', 'text-gray-500');
    paneSidebarHist?.classList.remove('hidden');
    paneSidebarCols?.classList.add('hidden');
  });

  // Busca de Requisições na Sidebar
  searchReqInput?.addEventListener('input', () => {
    renderCollectionsList(searchReqInput.value);
  });

  // Criar Nova Coleção
  btnNewCol?.addEventListener('click', async () => {
    const name = await promptText('Nova Coleção', 'Nome da coleção:', 'Microsserviço Vendas', 'Ex: Pagamentos, Usuários');
    if (name) {
      const newCol = controller.addCollection(name);
      collapsedColIds.delete(newCol.id);
      saveCollapsedState(collapsedColIds);
      renderCollectionsList(searchReqInput?.value || '');
      showToast(`Coleção "${name}" criada com sucesso!`, 'success');
    }
  });

  // Alternar Recolher / Expandir Todas as Pastas
  btnToggleAllCols?.addEventListener('click', () => {
    const cols = controller.getCollections();
    if (cols.length === 0) return;
    const allCollapsed = cols.every((c) => collapsedColIds.has(c.id));
    if (allCollapsed) {
      collapsedColIds.clear();
      collapsedFolderKeys.clear();
      showToast('Todas as pastas expandidas.', 'info', 1500);
    } else {
      cols.forEach((c) => {
        collapsedColIds.add(c.id);
        if (c.folders) {
          c.folders.forEach((f) => collapsedFolderKeys.add(`${c.id}::${f}`));
        }
        c.requests.forEach((r) => {
          if (r.folder) collapsedFolderKeys.add(`${c.id}::${r.folder}`);
        });
      });
      showToast('Todas as pastas recolhidas.', 'info', 1500);
    }
    saveCollapsedState(collapsedColIds);
    saveCollapsedFoldersState(collapsedFolderKeys);
    renderCollectionsList(searchReqInput?.value || '');
  });

  // Criar Nova Requisição Solta
  btnNewReq?.addEventListener('click', () => {
    syncUIToRequest();
    const newReq = controller.createEmptyRequest();
    controller.setCurrentRequest(newReq);
    syncRequestToUI(newReq);
  });

  // Salvar na Coleção
  btnSaveToCol?.addEventListener('click', async () => {
    syncUIToRequest();
    const cols = controller.getCollections();
    if (cols.length === 0) {
      showToast('Crie uma coleção primeiro no painel esquerdo.', 'warning');
      return;
    }

    const currentReq = controller.getCurrentRequest();

    // Se a requisição já pertence a uma coleção existente, salva direto
    if (currentReq.collectionId) {
      const parentCol = cols.find((c) => c.id === currentReq.collectionId);
      if (parentCol) {
        controller.saveCurrentRequestToCollection(currentReq.collectionId, currentReq.name, currentReq.folder);
        renderCollectionsList(searchReqInput?.value || '');
        showToast(`Requisição "${currentReq.name}" salva com sucesso!`, 'success');
        return;
      }
    }

    // Se é uma requisição nova/solta, pergunta nome e coleção de destino
    const defaultColId = cols[0].id;
    const result = await promptDialog({
      title: 'Salvar Requisição na Coleção',
      label: 'Nome da requisição:',
      defaultValue: currentReq.name,
      placeholder: 'Ex: Listar Clientes',
      selectLabel: 'Salvar na Coleção:',
      selectOptions: cols.map((c) => ({ label: c.name, value: c.id })),
      selectedOption: defaultColId,
      confirmText: 'Salvar'
    });

    if (result && result.value) {
      const targetColId = result.selectedOption || defaultColId;
      controller.saveCurrentRequestToCollection(targetColId, result.value, currentReq.folder);
      collapsedColIds.delete(targetColId);
      saveCollapsedState(collapsedColIds);
      renderCollectionsList(searchReqInput?.value || '');
      showToast(`Requisição "${result.value}" salva com sucesso!`, 'success');
    }
  });

  // Exportar Coleções
  btnExport?.addEventListener('click', () => {
    const json = controller.exportCollectionsJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    saveAs(blob, 'pwi-api-collections.json');
  });

  // --- Importação Bruno & Modal ---
  function switchImportTab(tab: 'bruno' | 'text') {
    if (tab === 'bruno') {
      tabBtnImportBruno?.classList.add('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
      tabBtnImportBruno?.classList.remove('border-transparent', 'text-gray-500', 'dark:text-slate-400');
      tabBtnImportText?.classList.remove('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
      tabBtnImportText?.classList.add('border-transparent', 'text-gray-500', 'dark:text-slate-400');
      tabPaneImportBruno?.classList.remove('hidden');
      tabPaneImportText?.classList.add('hidden');
    } else {
      tabBtnImportText?.classList.add('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
      tabBtnImportText?.classList.remove('border-transparent', 'text-gray-500', 'dark:text-slate-400');
      tabBtnImportBruno?.classList.remove('border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
      tabBtnImportBruno?.classList.add('border-transparent', 'text-gray-500', 'dark:text-slate-400');
      tabPaneImportText?.classList.remove('hidden');
      tabPaneImportBruno?.classList.add('hidden');
    }
  }

  tabBtnImportBruno?.addEventListener('click', () => switchImportTab('bruno'));
  tabBtnImportText?.addEventListener('click', () => switchImportTab('text'));

  function displayBrunoPreview(res: BrunoImportResult) {
    pendingBrunoResult = res;
    if (!brunoPreviewContainer || !brunoPreviewStats || !brunoPreviewList || !btnConfirmBrunoImport) return;

    if (res.collections.length === 0) {
      brunoPreviewContainer.classList.add('hidden');
      btnConfirmBrunoImport.disabled = true;
      showToast('Nenhuma rota ou coleção válida do Bruno (.bru / .yml) foi encontrada.', 'warning');
      return;
    }

    brunoPreviewStats.textContent = `${res.collections.length} coleção(ões) • ${res.totalRequests} rota(s) • ${res.environments.length} ambiente(s)`;
    brunoPreviewList.innerHTML = res.collections
      .map((c) => {
        const envCount = res.environments.filter((e) => e.name.startsWith(c.name)).length;
        return `
          <div class="flex items-center justify-between py-1 px-1">
            <div class="flex items-center gap-1.5 truncate min-w-0">
              <span class="font-bold text-gray-800 dark:text-slate-200 truncate">📁 ${escapeHtml(c.name)}</span>
              ${envCount > 0 ? `<span class="px-1.5 py-0.2 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded text-[10px]">${envCount} env</span>` : ''}
            </div>
            <span class="text-[11px] text-gray-500 dark:text-slate-400 font-mono">${c.requests.length} rotas</span>
          </div>
        `;
      })
      .join('');

    brunoPreviewContainer.classList.remove('hidden');
    btnConfirmBrunoImport.disabled = false;
  }

  const pickBrunoFolder = async () => {
    try {
      const res = await pickDirectoryWithCustomConfirm({
        id: 'bruno_collection_picker',
        fallbackInput: brunoFolderInput || undefined
      });
      if (!res) return;
      showToast('Lendo arquivos da pasta selecionada...', 'info');
      const importRes = await importBrunoDirectory(res.files);
      displayBrunoPreview(importRes);
      showToast(`${importRes.collections.length} coleções do Bruno preparadas para importação!`, 'success');
    } catch (err: any) {
      showToast('Erro ao ler pasta do Bruno: ' + (err?.message || err), 'error');
    }
  };

  brunoDropzone?.addEventListener('click', () => {
    pickBrunoFolder();
  });

  brunoDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    brunoDropzone.classList.add('border-indigo-600', 'bg-indigo-100/50');
  });
  brunoDropzone?.addEventListener('dragleave', () => {
    brunoDropzone.classList.remove('border-indigo-600', 'bg-indigo-100/50');
  });
  brunoDropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    brunoDropzone.classList.remove('border-indigo-600', 'bg-indigo-100/50');
    const fileList = e.dataTransfer?.files;
    if (fileList && fileList.length > 0) {
      const filesArray = Array.from(fileList);
      const folderName = filesArray[0]?.webkitRelativePath?.split('/')[0] || 'Arquivos arrastados';
      const confirmed = await confirmFolderUploadDialog({
        folderName,
        fileCount: filesArray.length
      });
      if (!confirmed) return;
      showToast('Lendo arquivos arrastados...', 'info');
      const res = await importBrunoDirectory(filesArray);
      displayBrunoPreview(res);
      showToast(`${res.collections.length} coleções do Bruno preparadas para importação!`, 'success');
    }
  });

  btnBrunoLoadPath?.addEventListener('click', async () => {
    const p = brunoPathInput?.value.trim() || 'C:\\TestesVF\\RotasAPI\\Bruno';
    try {
      showToast(`Buscando rotas em ${p}...`, 'info');
      const resp = await fetch(`/api/bruno-read?path=${encodeURIComponent(p)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && Array.isArray(data.files)) {
          const res = importBrunoFromFiles(data.files);
          displayBrunoPreview(res);
          showToast(`Lidas ${res.collections.length} coleções (${res.totalRequests} rotas) diretamente do disco!`, 'success');
          return;
        }
      }
    } catch {
      // Fallback
    }
    showToast('Não foi possível ler diretamente do disco via servidor local. Abrindo seletor de pastas...', 'info');
    pickBrunoFolder();
  });

  btnConfirmBrunoImport?.addEventListener('click', () => {
    if (!pendingBrunoResult) return;
    const merge = brunoMergeCheckbox ? brunoMergeCheckbox.checked : true;
    const res = controller.importBrunoResult(pendingBrunoResult, merge);
    renderCollectionsList();
    updateEnvironmentsDropdown();
    modalImport?.classList.add('hidden');
    pendingBrunoResult = null;
    if (brunoPreviewContainer) brunoPreviewContainer.classList.add('hidden');
    if (btnConfirmBrunoImport) btnConfirmBrunoImport.disabled = true;
    showToast(
      `Importação Bruno concluída com sucesso! ${res.importedCols} coleção(ões), ${res.importedReqs} rota(s) e ${res.importedEnvs} ambiente(s) importados.`,
      'success'
    );
  });

  btnCancelBrunoImport?.addEventListener('click', () => {
    modalImport?.classList.add('hidden');
  });

  btnImportBruno?.addEventListener('click', () => {
    switchImportTab('bruno');
    modalImport?.classList.remove('hidden');
  });

  btnImport?.addEventListener('click', () => {
    if (importTextInput) importTextInput.value = '';
    switchImportTab('bruno');
    modalImport?.classList.remove('hidden');
  });
  btnCloseModalImport?.addEventListener('click', () => modalImport?.classList.add('hidden'));

  btnConfirmImport?.addEventListener('click', () => {
    const text = importTextInput?.value.trim();
    if (!text) {
      showToast('Cole o JSON ou comando cURL.', 'warning');
      return;
    }

    if (text.toLowerCase().startsWith('curl')) {
      const parsed = controller.parseCurl(text);
      const newReq = controller.createEmptyRequest();
      Object.assign(newReq, parsed);
      controller.setCurrentRequest(newReq);
      syncRequestToUI(newReq);
      modalImport?.classList.add('hidden');
      showToast('Comando cURL importado com sucesso!', 'success');
    } else {
      try {
        const res = controller.importCollectionsJson(text);
        renderCollectionsList();
        updateEnvironmentsDropdown();
        modalImport?.classList.add('hidden');
        showToast(`Importação concluída! ${res.importedCols} coleção(ões) e ${res.importedEnvs} ambiente(s) importados.`, 'success');
      } catch (e: any) {
        showToast('Erro ao importar JSON: ' + (e?.message || e), 'error');
      }
    }
  });

  // Limpar Histórico
  btnClearHist?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Limpar Histórico',
      message: 'Deseja excluir todo o histórico recente de requisições?',
      confirmText: 'Limpar Histórico',
      isDanger: true
    });
    if (ok) {
      controller.clearHistory();
      renderHistoryList();
      showToast('Histórico limpo com sucesso.', 'info');
    }
  });

  // Modal Ambientes
  btnManageEnvs?.addEventListener('click', () => {
    renderEnvsModal();
    modalEnvs?.classList.remove('hidden');
  });
  btnCloseModalEnvs?.addEventListener('click', () => {
    modalEnvs?.classList.add('hidden');
    updateEnvironmentsDropdown();
    updateUrlResolvedPreview();
  });
  btnModalAddEnv?.addEventListener('click', async () => {
    const name = await promptText('Novo Ambiente', 'Nome do ambiente:', 'Novo Ambiente', 'Ex: Homologação, Produção');
    if (name) {
      controller.addEnvironment(name);
      renderEnvsModal();
      updateEnvironmentsDropdown();
      showToast(`Ambiente "${name}" criado com sucesso!`, 'success');
    }
  });

  activeEnvSelect?.addEventListener('change', () => {
    controller.setActiveEnvironment(activeEnvSelect.value);
    syncRequestToUI(controller.getCurrentRequest());
    if (varsPopover && !varsPopover.classList.contains('hidden')) {
      renderVarsPopover();
    }
  });

  // Modal Snippets de Código
  btnShowSnippet?.addEventListener('click', () => {
    updateSnippetModal();
    modalSnippet?.classList.remove('hidden');
  });
  btnCloseModalSnippet?.addEventListener('click', () => modalSnippet?.classList.add('hidden'));
  snippetLangSelect?.addEventListener('change', updateSnippetModal);

  btnCopySnippet?.addEventListener('click', () => {
    const lang = (snippetLangSelect?.value || 'curl') as any;
    const code = controller.generateSnippet(controller.getCurrentRequest(), lang);
    navigator.clipboard.writeText(code).then(() => {
      showToast('Código copiado com sucesso!', 'success');
    });
  });

  // Inicializa tudo na interface
  updateEnvironmentsDropdown();
  syncRequestToUI(controller.getCurrentRequest());
  renderCollectionsList();
  renderHistoryList();
}
