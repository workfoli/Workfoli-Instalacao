<!--
Molde de perfil: AGÊNCIA / CONSULTORIA
Equipe pequena entregando pra vários clientes ao mesmo tempo. O sistema gira em torno de
proposta, atendimento e produção em paralelo.
O /instalar preenche os [colchetes] com as respostas da entrevista e acrescenta tudo abaixo
deste comentário no FINAL do AGENTS.md (sem este comentário). Nunca substitui o AGENTS.md.
-->

## Sobre este negócio — [Nome da Agência]

[Uma frase do que esta pasta representa. Ex: "Operação da agência: clientes, propostas,
conteúdo e entregas."]

### Estrutura de pastas

- `clientes/` — uma subpasta por cliente, autossuficiente (criada pelo `/novo-projeto`)
- `briefings/` — briefings de quem ainda não virou cliente
- `propostas/` — propostas em andamento (criadas pelo `/proposta`)
- `marketing/` — conteúdo institucional da agência
- `saidas/` — análises e documentos pontuais
- `dados/` — arquivos a analisar (relatórios de cliente, exports)
- `tarefas.md` — pipeline da agência

### Sobre a agência

Somos uma [tipo: marketing digital / design / conteúdo / consultoria].
Atendemos [perfil real de cliente]. Serviços principais:

- [serviço 1]
- [serviço 2]
- [serviço 3]

Equipe: [N pessoas e quem faz o quê]. Capacidade: [N clientes ativos ao mesmo tempo].

### Clientes ativos

[Lista breve. O `/atualizar` mantém sincronizado com as pastas em `clientes/`.]

### O que mais produzimos

- Propostas comerciais pra novos clientes
- [outros entregáveis frequentes: anúncios, conteúdo, relatórios]

### Regras do sistema

- Cliente novo → `/novo-projeto` cria `clientes/<Nome>/` com briefing e subpastas das entregas contratadas
- Proposta nova → `/proposta`, salva em `propostas/<cliente>-<data>.html` até fechar; depois, em `clientes/<Nome>/`
- Casos de sucesso ficam em `clientes/<Nome>/caso.md` (reaproveitados em propostas)
- Relatório de cliente → `/relatorio-ads` ou `/analisar-dados`, salvo dentro da pasta do cliente
- [outras regras que aparecerem com o uso]

### Ferramentas conectadas

- [ ] Notion
- [ ] Gmail
- [ ] Google Calendar
- [ ] Canva
- [ ] Meta Ads
- [ ] Google Ads

*(Marcar conforme os conectores forem ativados. Ver `templates/ferramentas/catalogo.md`.)*
