---
name: instalar
description: >
  Instala o Workfoli no negócio do usuário. Faz uma entrevista curta sobre empresa, clientes,
  tom de voz, foco atual e identidade visual, preenche `_memoria/empresa.md`,
  `_memoria/preferencias.md`, `_memoria/estrategia.md`, `identidade/design-guide.md`,
  `tarefas.md` e o manifesto `workfoli.base.json`, e acrescenta ao `AGENTS.md` as regras do perfil escolhido. Use quando o usuário
  acabou de baixar o Workfoli ou pedir "/instalar", "instalar o Workfoli", "configurar o sistema"
  ou "primeiro setup".
---

# /instalar — Instalação inicial do Workfoli

É o primeiro comando depois de baixar o Workfoli. Não pode falhar e não pode soar burocrático. Trate como conversa de descoberta: uma pergunta por vez, escuta de verdade, nada de questionário em bloco. No fim, o sistema precisa saber quem é o negócio, como ele fala e onde está o atrito do dia a dia.

## Pré-checagem

### Memória já preenchida?

Conferir se `_memoria/empresa.md`, `_memoria/preferencias.md`, `_memoria/estrategia.md` ou `identidade/design-guide.md` já têm conteúdo real (não só os campos vazios do molde) e se o `AGENTS.md` já tem a seção `## Sobre este negócio`.

Se algo já estiver preenchido:
> "Já tem contexto preenchido aqui. Quer recomeçar do zero ou só completar o que falta?"

- **Recomeçar:** sobrescrever os arquivos de memória e substituir a seção `## Sobre este negócio` do `AGENTS.md`
- **Completar:** fazer só as perguntas cujas respostas estão faltando

Setup limpo → seguir direto.

---

## Fase 1 — Perfil

Perguntar qual perfil mais combina com o negócio:

1. **Solopreneur / criador**: uma pessoa só, marca pessoal e negócio misturados
2. **Freelancer**: atende clientes, organiza por projeto
3. **Agência / consultoria**: equipe pequena entregando pra vários clientes
4. **Empresa**: empresa estabelecida, com setores (marketing, comercial, financeiro etc.)

O perfil define o molde usado na Fase 3: `templates/perfis/claude-md-<perfil>.md` (`solopreneur`, `freelancer`, `agencia` ou `empresa`).

---

## Fase 2 — Entrevista

Fazer as perguntas nesta ordem, esperando cada resposta antes de seguir. Se a resposta vier vaga, pedir concretude uma vez só. Não insistir mais que isso: registrar o que vier.

**Sobre o negócio:**
1. "Como se chama o que você faz? (nome da empresa, ou seu nome se for marca pessoal)"
2. "O que você entrega, em uma frase, do jeito que você explicaria pro vizinho?"
3. "Quem te paga? Descreve o cliente real em uma ou duas frases, sem persona genérica."
4. "Por que esse cliente escolhe você e não o concorrente? Vale coisa concreta: prazo, garantia, anos de mercado, certificação, atendimento."
5. "Você toca sozinho ou tem equipe? Se tem, quantas pessoas e quem faz o quê?"
6. "Onde te encontram? Cidade ou região que você atende (ou se é online, pro Brasil todo), site, @ do Instagram e o contato principal (WhatsApp, e-mail ou telefone)."

**Sobre a voz:**
7. "Me cola um exemplo real e recente da sua escrita: uma legenda, um e-mail pra cliente, qualquer coisa. Assim eu calibro o seu jeito de escrever sem adivinhar."
8. "O que te dá ranço quando alguém escreve? (ex: 'vamos juntos!', emoji em e-mail formal, 'caro cliente', jargão de guru, 'alavancar', 'sinergia')"

**Sobre o foco:**
9. "Qual o gargalo do seu negócio hoje? O que está segurando o crescimento?"
10. "Se eu pudesse tirar UMA tarefa repetitiva das suas costas toda semana, qual seria?"

**Sobre a identidade visual:**
11. "Você tem identidade visual definida ou está no zero? Se tem, me passa as cores principais e a fonte."
12. "Tem logo? Se sim, coloca o arquivo em `identidade/logo.png` (ou `.svg`) e me avisa."

Se a pessoa não tiver identidade visual, oferecer (sem insistir) um dos exemplos de `templates/identidade/exemplos/` como ponto de partida.

---

## Fase 3 — Preenchimento dos arquivos

### `_memoria/empresa.md`
Perguntas 1 a 6 + perfil da Fase 1. Preencher os campos do molde (Nome, O que faz, Perfil, Clientes, Equipe, Região de atuação, Site, Redes sociais, Contato principal) e a seção **Diferenciais** com a resposta 4, em tópicos concretos.

### `_memoria/preferencias.md`
Perguntas 7 e 8:
- **Tom de voz:** descrever em 2-3 frases o jeito de escrever, derivado do exemplo real
- **O que evitar:** lista direta da resposta 8
- **Estilo geral:** o que combina e o que destoa
- **Exemplo de referência:** colar o trecho da resposta 7 (até ~10 linhas) pra servir de modelo de voz

### `_memoria/estrategia.md`
Perguntas 9 e 10:
- **Gargalo atual:** resposta 9
- **Prioridade principal:** uma frase que ataca o gargalo direto (será confirmada no resumo da Fase 4)
- **Pra tirar das costas:** resposta 10, anotada como candidata a skill via `/mapear-rotinas`
- **O que pode esperar** e **Prazos e datas:** só se a pessoa mencionou; senão, deixar em branco

### `identidade/design-guide.md`
Se vieram cores, fontes ou logo (perguntas 11 e 12), preencher os campos correspondentes. Se não, deixar como está e avisar:
> "Deixei o `identidade/design-guide.md` em branco. Enquanto isso, o `/carrossel` e o `/proposta` usam um estilo padrão sóbrio. Quando você definir sua identidade, é só editar esse arquivo (ou me pedir)."

### `tarefas.md`
Adicionar em "Agora": `- [ ] Rodar /mapear-rotinas pra tirar das costas: <resposta 10>`

### `workfoli.base.json` (manifesto)
É o índice local que os agentes leem. Editar só os campos abaixo, mostrando a alteração antes de gravar:

- Se `status` ainda for `"template"` (pasta recém-clonada do modelo): trocar para `"active"`, preencher `baseId` com um UUID novo (`node -e "console.log(crypto.randomUUID())"`) e `createdAt` com a data/hora atual em ISO 8601. Se a pasta já foi ativada, esses campos já vêm prontos: não mexer.
- `company.name` (resposta 1), `company.slug` (resposta 1 em minúsculas, sem acentos, espaços viram hífen, sem caracteres especiais; ex.: "Acme Empresa Ltda" → `acme-empresa-ltda`), `company.description` (resposta 2, uma frase), `company.website` (resposta 6, só se houver URL; senão `null`).
- `profile`: Solopreneur → `general`, Freelancer → `services`, Agência → `agency`, Empresa → `general`.
- `services`: um item por serviço citado nas respostas 2 e 4, com `id` em minúsculas e hífens, `name` e `summary` curtos. Criar também `servicos/<id>.md` a partir do modelo em `servicos/README.md` só com o que foi dito (lacunas ficam `[A CONFIRMAR]`).
- `identity.logo`: caminho do logo, se a pessoa colocou o arquivo em `identidade/`.

Depois rodar `npm run validar`. Se apontar erro, corrigir antes de seguir. Nunca colocar senha, token ou dado pessoal no manifesto.

### `AGENTS.md` — acrescentar, nunca sobrescrever
1. Pegar o molde do perfil (`templates/perfis/claude-md-<perfil>.md`)
2. Preencher os `[colchetes]` com as respostas da entrevista. O que não foi respondido sai do texto (não deixar colchete vazio)
3. Acrescentar o resultado no **final** do `AGENTS.md`, sem o comentário `<!-- ... -->` do topo do molde. O molde já começa com `## Sobre este negócio`

As regras compartilhadas do `AGENTS.md` nunca são apagadas nem reescritas: elas são o que faz o sistema funcionar para os dois agentes.

---

## Fase 4 — Resumo

Mostrar o que foi configurado:

```
✓ Perfil: [perfil]
✓ Negócio: _memoria/empresa.md
✓ Tom de voz: _memoria/preferencias.md
✓ Foco: _memoria/estrategia.md
  Prioridade principal: "[frase]" ← confere se é isso mesmo?
✓ Marca: identidade/design-guide.md  [preenchida | em branco, usando estilo padrão]
✓ Pendências: tarefas.md
✓ Manifesto: workfoli.base.json ([N] serviço(s), validado)
✓ AGENTS.md com as regras do perfil [perfil]
```

Se a pessoa corrigir a prioridade, ajustar `estrategia.md` na hora.

---

## Fase 5 — Desligar do modelo público

Quem clona o Workfoli recebe a pasta ligada ao modelo público (`github.com/workfoli/workfoli`). Agora que a pasta é da empresa, nenhum envio pode ir para lá.

Conferir, nesta ordem:
1. `git rev-parse --show-toplevel` aponta para esta pasta (não para uma pasta acima dela);
2. `git remote get-url origin` aponta para `github.com/workfoli/workfoli`.

Se as duas condições valerem, rodar:

```
git remote rename origin workfoli
git remote set-url --push workfoli DESATIVADO
git branch --unset-upstream
```

O modelo continua disponível como remoto `workfoli` para consultar novidades (`git fetch workfoli`), mas não aceita envio. Avisar em uma linha:

> "Desliguei esta pasta do modelo público do Workfoli: nada da sua empresa vai para lá. Quando quiser guardar no seu GitHub, roda `/salvar` que eu configuro um repositório privado."

Se a pasta não for repositório Git, não tiver `origin` ou o `origin` já apontar para outro repositório, pular esta fase.

---

## Fase 6 — Próximos passos

> "Pronto. O Workfoli já conhece o seu negócio.
>
> No começo de cada sessão, roda `/abrir`: eu mostro o foco e as pendências antes de começar. No fim, `/fechar` registra o que foi feito e o que ficou pendente. Quando quiser um carrossel, uma proposta, um plano de SEO ou uma campanha, é só pedir.
>
> Você disse que repete '<resposta 10>' toda semana. Quando quiser tirar isso das costas de vez, roda `/mapear-rotinas` que eu transformo em skill sua."

Mencionar também:
- `/salvar` pra guardar tudo num repositório privado no GitHub (backup e histórico)
- `npm install` uma vez, se a pessoa for gerar carrossel ou PDF

---

## Regras

- Não inventar dados. Resposta vaga fica registrada como veio (ou o campo fica vazio)
- Não escrever "este arquivo será preenchido pelo /instalar" nos arquivos finais
- O setup deve durar de 5 a 7 minutos. Se a pessoa travar numa pergunta, registrar o que tem e seguir
- Não fazer perguntas além das listadas sem motivo claro
- Nunca apagar nem reescrever as regras compartilhadas do `AGENTS.md`
