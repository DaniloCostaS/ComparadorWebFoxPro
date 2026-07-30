# Comparador Web FoxPro

Uma aplicação web moderna, rápida e **100% executada no cliente (navegador)** para análise de diferenças de código-fonte, comparação em lote de projetos e busca de referências, com suporte nativo e especializado aos arquivos do **Visual FoxPro** (`.SCX/.SCT`, `.FRX/.FRT`, `.PRG`, `.VCX/.VCT`).

Desenvolvido para eliminar as etapas morosas de exportação manual e uso de softwares locais como *FoxCompare* e *BeyondCompare*, centralizando todo o fluxo de trabalho em uma única ferramenta web moderna e responsiva.

---

## 🚀 Funcionalidades Principais

### 1. 📁 Comparador em Lote de Pastas / Repositórios (FoxPro)
- **Comparação de Pastas Completas**: Selecione a pasta de versão original (*Antes*) e a pasta modificada (*Depois*). O sistema varre automaticamente subpastas comparando arquivos de mesmo nome.
- **Suporte Amplo de Arquivos**: Suporta Formulários (`.SCX/.SCT`), Relatórios (`.FRX/.FRT`) e Programas (`.PRG`).
- **Filtro Inteligente de Arquivos Sem Alteração**: Identifica conteúdos 100% idênticos e omite a geração do HTML no ZIP, poupando espaço e tempo de análise.
- **Tratamento de Arquivos Novos e Ausentes**:
  - Contabiliza separadamente arquivos **Novos** (existentes apenas na pasta *Depois*).
  - Opção ativável `Verificar arquivos ausentes` para rastrear arquivos **Ausentes/Removidos** (existentes apenas na pasta *Antes*).
- **Dashboard de Estatísticas e Resumo**:
  - Cards visuais com métricas em tempo real (*Com Alterações*, *Sem Alterações*, *Novos*, *Ausentes*, *Erros*).
  - Lista categorizada interativa com badges indicativos coloridos.
  - Filtros rápidos por status para inspecionar os arquivos processados.

### 2. 🔍 Code References (Busca em Lote no Código)
- **Varredura Completa de Código**: Busca termos em todos os arquivos FoxPro de um diretório e suas subpastas (`.PRG`, `.SCX/.SCT`, `.VCX/.VCT`, `.FRX/.FRT`).
- **Pesquisa Multi-Termos (AND)**: Permite adicionar múltiplas palavras ou expressões de busca com tags removíveis.
- **Filtros Avançados de Pesquisa**:
  - *Match Whole Word*: Busca por palavras exatas.
  - *Match Case*: Diferencia maiúsculas e minúsculas.
  - *Match Same Method*: Exige que os termos estejam presentes no mesmo método/procedure.
- **Visualização em Árvore Interativa (Tree View)**: Apresenta os resultados organizados hierarquicamente (`Arquivo > Objeto > Método > Linha de código`), com botões para expandir e colapsar todos os nós.

### 3. 🖥️ Visualizador Interativo de HTML Gerado
Cada comparação gerada exporta um relatório HTML autônomo com recursos avançados:
- **Navegação de Diferenças**: Botões *Anterior / Próximo* com contador de diferenças ativas e rolagem suave até o trecho alterado.
- **Filtro por Método/Procedure**: Dropdown que isola a visualização para um método ou bloco de propriedades específico.
- **Ocultar Linhas Iguais**: Oculta linhas sem alterações para focar apenas nas modificações (*Focus mode*).
- **Busca por Texto e Ir para Linha**: Destaque e navegação em qualquer linha ou termo buscado.
- **Ignorar Propriedades / Palavras Específicas**:
  - Lista dinâmica de termos ignorados (`top`, `left`, `height`, `width`, `tabindex`, etc.).
  - **Análise pela Primeira Palavra**: Avalia a palavra inicial da linha. Ignora declarações de propriedades (ex: `LEFT = 130`), mas preserva funções no meio do código (ex: `NomeCliente = LEFT(DS_NOME, 40)`).

### 4. 📄 Comparador Nativo de Texto e Arquivo Único
- **Comparador Nativo FoxPro Único**: Envie o par de binários (`.SCX/.SCT` ou `.FRX/.FRT`) ou arquivo `.PRG` individual para comparar diretamente no navegador.
- **Comparador de Texto Puro**: Cole dois blocos de código livremente para gerar uma comparação instantânea.
- **Atalhos de Embelezamento Rápido**: Botões integrados `✨ Formatar JSON/XML` diretamente nas caixas de texto para estruturar o código antes de comparar.
- **Parser DBF/FPT Interno (TypeScript Puro)**: Decodifica `Windows-1252`, extrai campos de memo (`PROPERTIES`, `METHODS`, `EXPR`, `TAG`, etc.).
- **Ordenação Alfabética Determinística**: Garante que os métodos e procedures fiquem ordenados de A-Z, evitando falsos-positivos de diferença por reordenação do FoxPro.

### 5. ✨ Embelezador / Formatador de Texto (JSON, XML e SQL)
- **Formatação de Dados Brutos / Minificados**: Converte códigos JSON desformatados, documentos XML em linha única e consultas SQL brutas em estruturas perfeitamente indentadas e legíveis.
- **Auto-Detecção de Formato**: Identifica automaticamente se o conteúdo colado é JSON, XML ou SQL.
- **Recuo / Indentação Personalizável**: Permite escolher o nível de indentação desejado (2 Espaços, 4 Espaços ou Tabulação `\t`).
- **Validação de Sintaxe e Erros em Tempo Real**: Valida a estrutura de dados durante a formatação e exibe o status de sucesso ou mensagens amigáveis indicando a localização exata de erros de sintaxe (ex: JSON malformado).
- **Minificação (Compactação)**: Opção de compactar JSON, XML ou textos removendo quebras de linha e espaços excedentes.
- **Ferramentas Práticas**: Botões de cópia direta para a área de transferência (`📋 Copiar`), download do arquivo formatado (`💾 Baixar Arquivo` com extensão apropriada `.json`, `.xml`, `.sql` ou `.txt`) e limpeza rápida (`🗑️ Limpar`).
- **Estatísticas de Linha e Caracteres**: Exibe contadores de linhas e caracteres do texto de entrada e do resultado formatado.

---

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído pensando em velocidade, privacidade e segurança. Todo o processamento é feito localmente no navegador, **sem envio de nenhum dado ou código-fonte para servidores externos**.

- **Vite**: Bundler e servidor de desenvolvimento ultra-rápido.
- **TypeScript**: Garantia de tipagem robusta em todo o sistema.
- **Tailwind CSS**: Estilização moderna, limpa e responsiva.
- **jsdiff**: Algoritmo matemático para cálculo de diferenças linha a linha e palavra por palavra.
- **JSZip & FileSaver.js**: Leitura, compactação e download de pacotes ZIP.

---

## 💻 Como Executar o Projeto

É necessário possuir o [Node.js](https://nodejs.org/) instalado na máquina.

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/DaniloCostaS/ComparadorWebFoxPro.git
   cd ComparadorWebFoxPro
   ```

2. **Instalar as dependências:**
   ```bash
   npm install
   ```

3. **Iniciar o Servidor de Desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acesse o endereço exibido no terminal (ex: `http://localhost:5173`).

4. **Gerar Versão de Produção (Build Estático):**
   ```bash
   npm run build
   ```
   A pasta `dist` gerada é 100% autônoma e pode ser aberta em qualquer computador apenas dando um duplo clique no arquivo `index.html` gerado dentro dela!

---

## 📜 Licença

Desenvolvido para otimização de tempo e análise ágil de código. Código aberto para uso, melhorias e evolução!
