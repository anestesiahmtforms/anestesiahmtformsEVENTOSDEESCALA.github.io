# Deploy do Apps Script de Eventos

Referencia operacional atualizada em 14/08/2026.

## Arquivo-fonte

- `tools/apps-script/SAHMT-eventos-registros.gs`

## Endpoint atualmente usado pelo app

- `https://script.google.com/macros/s/AKfycbx5qHJcAWk0dVGEvd9xnxeW6t7WgLE4nuDw8_pWRb26lh0KCUK4kEGoj4KzKGELenXZ/exec`

## Onde o app referencia este endpoint

- `app.js`
- `eventos/config.js`

## Planilha alvo

- Spreadsheet ID: `1WAeUMVOj21LEsWOE7RzsoSF_2QW1mQnMBxZuWupWnCI`
- Planilha: `Eventos de escala - Referencia PWA 2026`
- Aba: `Registros`

## Estrutura gravada

1. `Timestamp`
2. `Data do Evento`
3. `MEMBRO (AUSENTE/ATRASADO)`
4. `Tipo de Evento`
5. `Descricao do evento`
6. `Multiplo do atraso`
7. `SUBSTITUTO`
8. `TURNO`
9. `PAGADOR`
10. `CREDOR`
11. `VALOR A PAGAR`
12. `ORIGEM`

## Quando precisar republicar

1. Abra o projeto do Apps Script correspondente a este endpoint.
2. Substitua o codigo pelo conteudo de `tools/apps-script/SAHMT-eventos-registros.gs`.
3. Implante uma nova versao como aplicativo da web.
4. Se o endpoint mudar, atualize `app.js` e `eventos/config.js`.
5. Publique o repositorio novamente.
