# Tekko

App (para iPhone, pela Tela de Início) que junta ofertas de peças de computador, periféricos, monitores, PCs, notebooks, consoles e jogos de PS5/PS4, dá uma nota de 0 a 100 para cada oferta e mostra em qual loja o mesmo produto está mais barato.

Endereço: https://burneikoantonio.github.io/ofertas-pc

## Como funciona

- `coletar.rb`: robô que busca os preços (KaBuM!, Zoom para Amazon/Magalu/Fast Shop, Promobit para Pichau/Terabyte/Mercado Livre/AliExpress), junta o mesmo produto entre lojas, guarda o histórico e calcula a nota (metade preço em relação ao histórico, metade custo-benefício).
- `alertas.js`: manda notificações quando um item salvo baixa de preço e quando aparece oferta com nota alta.
- `.github/workflows/atualizar.yml`: roda 3 vezes por dia (8h, 13h, 19h) e de hora em hora na semana da Black Friday.
- `app/`: o app em si (publicado no GitHub Pages). `app/montar.js` é o "Montar PC": questionário de uso e orçamento e montagem automática conferindo soquete, memória (DDR4/DDR5), potência da fonte e tamanho da placa-mãe.
