# Comparador Web FoxPro

Uma aplicação web moderna, rápida e 100% executada no cliente (navegador) para realizar comparações de código-fonte e análise de diferenças, com suporte especializado a arquivos nativos do **Visual FoxPro** (`.SCX` e `.SCT`).

Desenvolvido para eliminar as etapas morosas de exportação manual e uso de softwares instalados localmente como o *FoxCompare* e *BeyondCompare*, centralizando tudo em uma única ferramenta baseada na web.

## 🚀 Funcionalidades Principais

A ferramenta possui três abas principais, focadas em diferentes necessidades de fluxo de trabalho:

### 1. Modo Lote (Substituto do FoxCompare/BeyondCompare)
- Processa múltiplos arquivos HTML com comparações já extraídas.
- Injeta automaticamente as diferenças e o nome dos formulários em um modelo base customizado.
- Ajusta a codificação `Windows-1252` para preservar acentuações.
- Empacota todos os arquivos processados e devolve o download limpo em um arquivo `.ZIP`.

### 2. Comparador Nativo de Texto
- Permite a colagem direta do **Código Original** e do **Código Modificado** em campos de texto.
- Calcula o *diff* localmente.
- Mapeia as adições e remoções utilizando as mesmas formatações CSS de cor de fundo e fonte (Laranja Escuro, itálico, taxado, etc.) que você já conhece.
- Exporta um arquivo HTML único já formatado e com todos os scripts visuais embutidos.

### 3. Comparador Nativo FoxPro (.SCX e .SCT)
- Lê **diretamente arquivos binários nativos do FoxPro**! Sem precisar exportá-los antes.
- Um parser DBF/FPT desenvolvido em TypeScript puro abre a estrutura dos arquivos `.SCX` e `.SCT` simultaneamente.
- Extrai e formata automaticamente `Properties` e `Methods` de todos os objetos do formulário.
- **Ordernação Alfabética de Procedures:** O parser garante que as procedures sejam ordenadas de forma previsível (A-Z), evitando falsos-positivos em blocos de código onde a ordem dos métodos tenha sido embaralhada pelo FoxPro durante o salvamento.

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído pensando em velocidade e segurança. Como todo o processamento é feito localmente no navegador (`Vanilla TypeScript`), **nenhum dado ou código-fonte da sua empresa é enviado à internet.**

- **Vite:** Ferramenta de build extremamente rápida.
- **TypeScript:** Para garantir tipagem segura durante o desenvolvimento.
- **Tailwind CSS:** Para estilização rápida, moderna e responsiva na interface.
- **jsdiff:** Biblioteca que lida com o algoritmo matemático de comparação de texto (`diff`).
- **JSZip / FileSaver.js:** Para manipulação em massa e download inteligente.

## 💻 Como Rodar o Projeto

Você precisa ter o [Node.js](https://nodejs.org/) instalado em sua máquina.

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/DaniloCostaS/ComparadorWebFoxPro.git
   cd ComparadorWebFoxPro
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Inicie o Servidor de Desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acesse a URL gerada no terminal (geralmente `http://localhost:5173`). Qualquer modificação feita nos arquivos será atualizada instantaneamente na tela.

4. **Gerar Versão de Produção (Build Estático):**
   ```bash
   npm run build
   ```
   Isso irá gerar a pasta `dist`. Essa pasta é totalmente independente e pode ser acessada apenas clicando duas vezes no arquivo `index.html` gerado dentro dela, sem necessidade de servidores!

## 📜 Licença
Feito para otimização de tempo. Código aberto para uso e evolução!
