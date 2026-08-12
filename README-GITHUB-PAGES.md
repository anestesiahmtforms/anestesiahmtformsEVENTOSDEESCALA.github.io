# SAHMT Web para GitHub Pages

Este pacote ja esta pronto para publicacao no GitHub Pages como PWA instalavel.

## Estrutura correta

Os arquivos do site ja estao preparados para ficar na raiz do repositorio publicado:

- `index.html`
- `styles.css`
- `app.js`
- `data.js`
- `sahmt_option1.png`
- `sahmt_option1_clean.png`
- `manifest.webmanifest`
- `service-worker.js`
- `icons/`
- `.nojekyll`

## Caminho mais simples

1. Crie um repositorio novo no GitHub.
2. Envie para a raiz do repositorio todos os arquivos deste pacote.
3. No GitHub, abra `Settings > Pages`.
4. Em `Build and deployment`, escolha:
   - `Source: Deploy from a branch`
   - `Branch: main`
   - `Folder: / (root)`
5. Salve.
6. Aguarde a URL publica do GitHub Pages.
7. Abra a URL no smartphone e use o banner `Instalar app na tela do smartphone` quando o navegador permitir.

## Para incorporar no Google Sites

Depois de publicado no GitHub Pages:

1. Copie a URL publica.
2. Abra sua pagina `sahmt-agenda` no Google Sites.
3. Use `Incorporar`.
4. Cole a URL do GitHub Pages.

## Observacao

O arquivo `.nojekyll` foi incluido para evitar qualquer interferencia do pipeline padrao do GitHub Pages em um site HTML estatico simples.
