# Comparador Web FoxPro & PWI Suite

Uma aplicação web moderna, rápida e **100% executada no cliente (navegador)** para análise de diferenças de código-fonte, comparação em lote de projetos, busca de referências, validação fiscal, análise de planos SQL, documentação Markdown e um completo **Testador de API com integração ao Bruno**.

Desenvolvido para eliminar ferramentas legadas e softwares locais proprietários (como *FoxCompare* e *BeyondCompare*), centralizando todo o fluxo de trabalho de desenvolvimento, customização e testes em uma única interface moderna, rápida e com suporte a **Tema Escuro (Dark Mode)** e **Tema Claro (Light Mode)**.

---

## 🚀 Módulos e Funcionalidades

### 1. 📁 Comparador em Lote de Pastas (FoxPro Batch)
- **Comparação Recursiva de Diretórios**: Selecione a pasta de versão original (*Antes*) e a pasta modificada (*Depois*). O sistema varre automaticamente subpastas comparando arquivos de mesmo nome.
- **Suporte Amplo de Arquivos**: Formulários (`.SCX/.SCT`), Relatórios (`.FRX/.FRT`) e Códigos-fonte (`.PRG`).
- **Seletor Inteligente de Pastas**: Utiliza a moderna API de Sistema de Arquivos com **diálogos próprios da aplicação**, eliminando caixas cinzas e mensagens bloqueantes do navegador.
- **Detecção de Arquivos Novos e Ausentes**:
  - Contabiliza separadamente arquivos **Novos** (existentes apenas na versão nova).
  - Opção ativável para rastrear arquivos **Ausentes/Removidos** (existentes apenas na versão original).
- **Filtro Inteligente de Arquivos Sem Alteração**: Identifica conteúdos 100% idênticos e omite a geração do HTML no ZIP, poupando espaço e acelerando a análise.
- **Opções Flexíveis de Saída**:
  - Download de um pacote `.ZIP` com relatórios HTML individuais para cada arquivo modificado.
  - Geração de **HTML Único Consolidado**, reunindo todas as comparações em um único arquivo navegável.
- **Dashboard de Estatísticas**: Métricas em tempo real com contadores visuais e badges de status (*Com Alterações*, *Sem Alterações*, *Novos*, *Ausentes*, *Erros*).

---

### 2. 🔍 Code References (Busca em Lote no Código)
- **Varredura Completa**: Localiza termos em todos os arquivos FoxPro de uma pasta e suas subpastas (`.PRG`, `.SCX/.SCT`, `.VCX/.VCT`, `.FRX/.FRT`).
- **Pesquisa Multi-Termos (AND)**: Permite adicionar múltiplas palavras ou frases de busca com tags visuais removíveis.
- **Filtros Avançados**:
  - *Palavra Inteira (Match Whole Word)*: Busca por correspondência exata.
  - *Diferenciar Maiúsculas/Minúsculas (Match Case)*.
  - *Mesmo Método*: Garante que todos os termos estejam presentes dentro da mesma procedure/método.
  - *Mesma Linha*: Exige que os termos estejam na mesma linha de instrução.
  - *Ignorar Espaços Excedentes*: Facilita buscas em códigos com diferentes indentações.
- **Visualização Hierárquica em Árvore (Tree View)**: Apresenta os resultados organizados por `Arquivo > Objeto > Método > Linha de código`, com botões rápidos para expandir e recolher todos os nós.
- **Integração com Editores Locais**: Botões de ação rápida para abrir o arquivo e posicionar o cursor diretamente no:
  - **VS Code**: Via comando `code --goto "arquivo:linha"`.
  - **Visual FoxPro**: Via automação OLE/COM executando `MODIFY COMMAND` ou `MODIFY FORM`.

---

### 3. 🔬 Analisar Customizações do Repositório
- **Varredura Automática do Repositório**: Selecione a pasta raiz de desenvolvimento (ex: `VolpeHomolog`). O analisador mapeia automaticamente:
  - Telas e Formulários (`.SCX/.SCT`) na raiz.
  - Programas e Procedures (`.PRG`) na pasta `OBJETOS/`.
  - Relatórios (`.FRX/.FRT`) na pasta `REPORTS/`.
  - Demais pares binários de customização (STOB).
- **Comparação com a Base Padrão**: Identifica o que foi alterado em relação à versão original e separa o que permanece idêntico.
- **Dashboard com Métricas Categorizadas**: Resumo visual de total de customizações, itens modificados e inalterados, separados por FORMs, PRGs e Relatórios.
- **Modal de Diff Integrado**: Permite inspecionar o código lado a lado diretamente na tela com opções de download do relatório HTML individual.

---

### 4. 📄 Comparador de Texto & Arquivo Único
- **Comparador FoxPro de Arquivo Único**: Envie o par de binários (`.SCX/.SCT` ou `.FRX/.FRT`) ou arquivo `.PRG` individual para comparar diretamente na tela.
- **Comparador de Texto Livre**: Cole dois trechos de código em caixas de texto com realce de sintaxe e gere um comparativo instantâneo.
- **Parser DBF/FPT Nativo em TypeScript**: Decodifica tabelas FoxPro sem dependências externas, extraindo propriedades, métodos, campos memo e procedures em `Windows-1252`.
- **Ordenação Alfabética Determinística**: Ordena os métodos e procedures de A-Z para eliminar falsos positivos decorrentes da reordenação interna do FoxPro.
- **Visualizador Interativo de Diferenças**:
  - Navegação entre blocos alterados (*Anterior / Próximo*) com foco suave.
  - Filtro por método ou procedure específica.
  - Opção *Focar apenas nas alterações* (ocultar linhas idênticas).
  - Regra inteligente para propriedades visuais: ignora atribuições repetitivas como `Top = ...`, `Left = ...`, mas preserva chamadas a funções como `LEFT(cString, 10)`.

---

### 5. ✨ Embelezador & Formatador de Texto (JSON, XML e SQL)
- **Formatação Inteligente**: Converte dados minificados ou desorganizados em código perfeitamente indentado e legível.
- **Detecção Automática**: Identifica sozinho se o texto colado é JSON, XML ou consulta SQL.
- **Indentação Personalizável**: Permite escolher entre 2 Espaços, 4 Espaços ou Tabulação (`\t`).
- **Validação de Sintaxe em Tempo Real**: Alerta sobre erros de estrutura, indicando linha e coluna exatas do problema (ex: vírgula sobrando ou tags XML abertas).
- **Minificação Rápida**: Remove quebras de linha e espaços excedentes com um clique.
- **Ações Rápidas**: Cópia para a área de transferência, limpeza e download imediato com extensão apropriada (`.json`, `.xml`, `.sql`, `.txt`).

---

### 6. 📋 Validador de Esquemas XML (NFS-e & NF-e)
- **Validação via WebAssembly (`xmllint-wasm`)**: Validação de arquivos XML contra esquemas oficiais XSD em milissegundos sem enviar documentos a servidores.
- **Suporte Multimunicipal e Federal**:
  - **NFS-e Padrão Nacional**: Esquemas oficiais de Produção e Homologação (DPS, NFS-e nacional).
  - **NFS-e São Paulo - SP**: Versões v01 e v02 da Prefeitura de SP.
  - **NFS-e Guarulhos - SP**: Padrão ABRASF.
  - **NF-e (SEFAZ - Modelo 55/65)**: Validação de Notas Fiscais Eletrônicas.
- **Modo Individual e Modo em Lote**:
  - Valide um XML colado ou carregado individualmente.
  - Arraste ou selecione múltiplos XMLs para validação simultânea com resumo de conformidade e exportação dos erros em `.txt`.
- **Exemplos Pré-carregados**: Botões de exemplo com XMLs prontos para testar rapidamente cada município e modelo.

---

### 7. ⚡ Leitor de Planos de Execução SQL (Showplan & Tuning)
- **Visualizador de Planos SQL Server**: Cole o XML gerado pelo SQL Server (`.sqlplan` ou `SET SHOWPLAN_XML ON`) e obtenha uma visualização clara da árvore de execução.
- **Detecção Automática de Gargalos**:
  - Destaca operadores de alto custo como *Table Scan*, *Clustered Index Scan*, *Sort*, *Hash Match* e *Key Lookup*.
  - Exibe o custo percentual de cada nó e número de linhas estimadas vs. executadas.
- **Badges Educacionais de Otimização**: Sugere correções práticas, criação de índices de cobertura e boas práticas para cada tipo de gargalo detectado.

---

### 8. 📖 Leitor & Editor de Markdown (GFM)
- **Padrão GitHub Flavored Markdown (GFM)**: Suporte completo a títulos, listas, tabelas, blocos de citação, código com destaque sintático e tarefas interativas.
- **Alertas Estilizados do GitHub**: Renderização de caixas especiais de destaque:
  > `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`
- **Modos de Visualização**:
  - *Lado a Lado (Split View)*: Edite o Markdown à esquerda com prévia renderizada em tempo real à direita.
  - *Apenas Prévia*: Leitura limpa e confortável.
  - *Modo Tela Cheia (Zen Mode)*: Foco total na leitura ou documentação.
- **Sumário Dinâmico (TOC)**: Painel lateral gerado automaticamente com links para navegar diretamente entre as seções.
- **Busca com Realce no Documento**: Destaque de termos em amarelo com contador de ocorrências e rolagem até os resultados.
- **Exportação para HTML Autônomo**: Gera um arquivo `.html` completo com todos os estilos embutidos, pronto para abrir offline ou compartilhar por e-mail.

---

### 9. 🌐 Testador de API (HTTP Client - Estilo Postman & Bruno)
- **Cliente HTTP Completo**: Dispare requisições `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` e `HEAD` diretamente do navegador.
- **Proxy Integrado Anti-CORS**: Servidor de desenvolvimento local faz o repasse transparente das chamadas, eliminando bloqueios de CORS ao testar APIs de microsserviços e prefeituras.
- **Pastas e Subpastas Recursivas (Hierarquia Ilimitada)**:
  - Crie pastas e subpastas dentro de cada coleção (`Acesso > Login > Autenticação`).
  - Arraste ou organize requisições preservando a árvore completa de diretórios.
  - Botões para recolher e expandir pastas e subpastas individualmente ou todas juntas.
- **Gerenciamento de Ambientes & Variáveis**:
  - Suporte à sintaxe `{{variavel}}` na URL, cabeçalhos, parâmetros e corpo da requisição.
  - Separação entre Variáveis Globais e Ambientes específicos (ex: *Produção*, *Homologação*, *Local*).
  - Painel de inspeção de variáveis: passe o mouse sobre qualquer `{{var}}` na barra de URL para inspecionar seu valor atual e origem.
  - Auto-complete dinâmico ao digitar `{{` em qualquer campo.
- **Importação Completa do Bruno**:
  - **Formato `.bru`**: Lê arquivos de requisição `.bru`, `folder.bru` e o descritor de coleção `bruno.json`.
  - **Formato OpenCollection `.yml`**: Suporte a coleções yaml do Bruno.
  - **Importação via Caminho Local**: Digite o caminho no disco (ex: `C:\TestesVF\RotasAPI\Bruno`) para leitura instantânea pelo servidor local sem janelas do navegador.
  - **Importação por Pasta ou Drag & Drop**: Suporte a seleção de diretórios com preservação da hierarquia de subpastas.
  - Suporte a comandos `cURL` e coleções JSON do Postman (v2.1).
- **Exportação Avançada & Modo Bruno (`.zip`)**:
  - **Exportar Coleção Individual**: Botão de exportação rápida na própria pasta da coleção.
  - **Exportar Múltiplas Coleções**: Tela dedicada com caixas de seleção (*checkboxes*), atalhos *Selecionar Todas / Desmarcar Todas* e contador de requisições.
  - **📦 Modo Bruno (`.zip`)**: Gera um arquivo ZIP contendo pastas reais, arquivos `bruno.json`, `folder.bru`, requisições `.bru` e ambientes `.bru`, pronto para abrir direto no Bruno (*Open Collection*).
  - **📄 Modo JSON (`.json`)**: Backup estruturado em arquivo único compatível com o Comparador e Postman.
  - Opção para incluir ou desconsiderar variáveis de ambiente no pacote exportado.

---

### 10. 🎨 Interface Moderna & Modais Próprios
- **Modais Nativos da Aplicação**: Substituição de diálogos cinzas e caixas rígidas do navegador por modais estilizados, responsivos e acessíveis pelo teclado (`Enter` para confirmar, `Esc` para fechar).
- **Dark & Light Mode**: Alternância de tema com persistência automática no armazenamento local.
- **Sistema de Notificações Toast**: Alertas discretos de sucesso, aviso e erro com animação suave.

---

## 🛠️ Tecnologias Utilizadas

- **Vite 8**: Bundler e servidor de desenvolvimento de altíssimo desempenho.
- **TypeScript 6**: Tipagem estática rigorosa para garantir estabilidade e previsibilidade.
- **Tailwind CSS**: Design system moderno, responsivo e adaptado para Dark/Light Mode.
- **Highlight.js**: Realce de sintaxe em dezenas de linguagens (FoxPro, SQL, TypeScript, JSON, XML, Bash, etc.).
- **Marked**: Parser de Markdown compatível com as especificações GFM.
- **JSZip & FileSaver.js**: Compactação, geração e download de pacotes ZIP e arquivos no cliente.
- **js-yaml**: Leitura e interpretação de coleções OpenCollection do Bruno em YAML.
- **xmllint-wasm**: Motor compilado de C/Libxml2 para WebAssembly para validação ultra-rápida de XSD.
- **jsdiff**: Algoritmo de cálculo de diferenças com granularidade linha a linha e caractere a caractere.

---

## 💻 Como Executar o Projeto

Certifique-se de possuir o [Node.js](https://nodejs.org/) (versão 18 ou superior) instalado no sistema.

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/DaniloCostaS/ComparadorWebFoxPro.git
   cd ComparadorWebFoxPro
   ```

2. **Instalar dependências:**
   ```bash
   npm install
   ```

3. **Iniciar o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   Abra no seu navegador o endereço indicado (geralmente `http://localhost:5173` ou `http://localhost:5174`).

4. **Gerar a versão de produção (Build estático):**
   ```bash
   npm run build
   ```
   A pasta `dist` gerada é totalmente autônoma e pode ser executada em qualquer máquina ou hospedada em qualquer servidor HTTP estático.

---

## 📜 Licença

Desenvolvido para modernização de rotinas, controle de customizações e testes ágeis de APIs e códigos legados. Código aberto para uso, melhorias contínuas e evolução técnica!
