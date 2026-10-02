---
name: email-profissional
description: >
  Rascunha um e-mail profissional a partir de um contexto livre, calibrando o tom ao destinatário
  e ao objetivo. Use quando o usuário disser "escreve um e-mail pra", "preciso mandar um e-mail
  sobre", "como eu respondo isso", "faz um e-mail pra [cliente/pessoa]", "cobra o cliente X" ou
  colar um e-mail recebido pedindo resposta.
---

# /email-profissional — Rascunho de e-mail

## Dependências

- **Contexto do negócio:** `_memoria/empresa.md` (nome, assinatura, contato)
- **Tom de voz:** `_memoria/preferencias.md`
- **Saída (opcional):** `saidas/emails/`

---

## Workflow

### Passo 1 — Coletar o contexto

Se faltar informação, perguntar:
1. "Pra quem é? (nome, cargo, relação com você)"
2. "Qual o objetivo? (cobrar, propor, responder, agradecer, fazer follow-up...)"
3. "Tem algo que precisa constar, ou que precisa evitar?"

Se o contexto veio solto (mesmo bagunçado), extrair o que der e seguir. Se for resposta a um e-mail colado, ler o original inteiro antes.

### Passo 2 — Escrever

**Considerar:**
- Tom proporcional à relação (cliente novo pede mais cuidado; parceiro antigo, mais direto)
- Objetivo claro já na abertura (não enterrar o pedido no fim)
- Uma ação pedida por vez
- Encerramento sem enrolação ("Qualquer dúvida, fico à disposição" só se fizer sentido)

**Estrutura:**
```
Assunto: [direto e específico]

[Nome],

[Parágrafo 1: contexto ou referência ao último contato]

[Parágrafo 2: o ponto principal ou o pedido]

[Parágrafo 3: próximo passo, com data se houver]

[Assinatura: nome e contato de _memoria/empresa.md]
```

### Passo 3 — Duas versões quando o assunto for delicado

Cobrança, feedback negativo, recusa ou reajuste de preço: oferecer
- **Versão A:** mais direta
- **Versão B:** mais suave

e deixar o usuário escolher.

### Passo 4 — Entrega

- Mostrar o e-mail pronto pra copiar
- Se houver conector de Gmail/Outlook ativo, oferecer criar o **rascunho** lá (nunca enviar sem confirmação explícita)
- Se o usuário quiser guardar: `saidas/emails/<YYYY-MM-DD>-<assunto-curto>.md`

---

## Regras

- Tom segue `_memoria/preferencias.md`
- Nada de linguagem corporativa genérica sem necessidade
- Assunto específico ("Proposta de SEO para a Padaria X — valores e prazo"), nunca vago ("Proposta", "Seguimento")
- Cobrança: direta, sem agressividade, com valor, vencimento e forma de pagamento
- Resposta: citar o contexto na primeira linha
- Nunca inventar prazo, valor ou compromisso que o usuário não informou
