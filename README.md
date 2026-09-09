# Autima — Leitor de codigo de barras

Leitor estatico com retorno automatico ao Contarestoque no Laragon.
Este pacote contem apenas a pagina do leitor, sem API ou configuracao do banco.

## GitHub Pages

Envie index.html, .nojekyll e a pasta assets para a raiz do repositorio.
Em Settings > Pages, selecione Deploy from a branch, branch main e /(root).
Depois de a publicacao terminar, configure externalScannerUrl no config.js
do Contarestoque com a URL exibida pelo GitHub Pages.

Abra o leitor pelo botao Ler com a camera do Contarestoque no celular.
O endereco de retorno e informado automaticamente. O celular deve continuar
conectado a rede local do computador para consultar o produto ao retornar.

Para atualizar este pacote a partir do projeto original:
`npm.cmd run build:scanner --prefix frontend`.
