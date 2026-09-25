---
name: proposta
description: >
  Cria uma proposta comercial com a identidade visual da marca, em HTML e PDF, a partir de um
  briefing curto ou da pasta do cliente. Estrutura: contexto, objetivo, solução, escopo (com o
  que não está incluído), cronograma, investimento e próximos passos. Use quando o usuário pedir
  "proposta", "orçamento", "proposta comercial", "mandar preço pro cliente", "montar proposta pra X"
  ou /proposta.
---

# /proposta — Proposta comercial

Transforma uma conversa com o cliente numa proposta pronta pra enviar: bonita, específica e fácil de aprovar.

## Dependências

- **Contexto:** `_memoria/empresa.md` (serviços, diferenciais, contato)
- **Tom de voz:** `_memoria/preferencias.md`
- **Visual:** `identidade/design-guide.md` (em branco → estilo base do `/carrossel`, adaptado pra A4)
- **Cliente:** `clientes/<Nome>/briefing.md`, se existir (criado pelo `/novo-projeto`)
- **PDF:** `scripts/render.js --pdf` (Playwright; `npm install` na raiz, uma vez)
- **Saída:** a pasta de propostas do perfil (ver "Sobre este negócio" no `AGENTS.md`). Padrão: `propostas/<cliente>-<YYYY-MM-DD>.html`; se o cliente já tem pasta, `clientes/<Nome>/proposta-<YYYY-MM-DD>.html`

---

## Workflow

### Passo 1 — Briefing

Se existir `clientes/<Nome>/briefing.md`, ler e pular o que já está respondido. Senão, perguntar numa mensagem só:

1. Pra quem é? (empresa, pessoa de contato, cargo)
2. Qual o problema ou objetivo do cliente, nas palavras dele?
3. O que você vai entregar? (escopo)
4. Prazo, valor (ou faixa) e condição de pagamento
5. Algo que precisa constar ou ser evitado? (desconto, garantia, concorrente)

Nunca inventar preço, prazo ou resultado. Valor que faltar fica como **[VALOR A DEFINIR]**, destacado.

### Passo 2 — Texto

Estrutura:

1. **Capa:** título orientado a resultado ("Mais pedidos pelo WhatsApp em 90 dias", não "Proposta de serviços"), nome do cliente, data, validade
2. **Contexto:** o que entendemos da situação, em 2-3 frases, usando as palavras do cliente
3. **Objetivo:** o que muda se der certo (mensurável quando possível)
4. **Solução:** como vamos resolver, em etapas
5. **Escopo:** o que está incluído e o que **não** está (é o que evita retrabalho)
6. **Cronograma:** marcos em semanas ou datas
7. **Investimento:** valor, forma de pagamento, validade da proposta
8. **Por que nós:** 2-3 provas concretas de `_memoria/empresa.md` (cases, números, anos de mercado). Nada inventado
9. **Próximos passos:** o que o cliente faz pra aprovar (responder o e-mail, assinar, pagar a entrada)

**CHECKPOINT:** mostrar o texto e esperar aprovação antes do visual.

### Passo 3 — Visual (HTML)

Um único arquivo HTML, CSS inline, Google Fonts como única dependência externa.

- Cores, fontes e logo do `identidade/design-guide.md`
- Formato A4 retrato: `@page { size: A4; margin: 0; }`, cada página como `<section class="pagina">` com `width: 210mm; min-height: 297mm; box-sizing: border-box; break-after: page;`. Sem o `border-box`, o padding alarga a página e o PDF sai encolhido
- Legível também no celular, pra quem abrir o HTML direto
- Tabela de investimento limpa, valores alinhados à direita
- Nada de imagem genérica de banco de fotos

### Passo 4 — PDF

Quando o cliente vai receber por e-mail (ou se o usuário pedir):

```bash
node scripts/render.js <caminho-da-proposta>.html --pdf
```

Gera o `.pdf` na mesma pasta. Abrir o PDF e conferir quebras de página, fontes e valores antes de entregar.

### Passo 5 — Entrega

```
✓ Proposta: <caminho>.html
✓ PDF: <caminho>.pdf

Validade: <data>
```

Oferecer:
> "Quer que eu escreva o e-mail de envio?" → `/email-profissional`

Se o cliente ainda não tem pasta, oferecer o `/novo-projeto`. Se a proposta for aprovada, oferecer registrar o cliente em `_memoria/empresa.md`.

---

## Regras

- Nunca inventar preço, prazo, resultado garantido, case ou depoimento
- Escopo sempre com "não incluso"
- Uma proposta, um cliente: ao reaproveitar texto de outra proposta, trocar nome, contexto e números
- Validade padrão de 15 dias (ajustável)
- Tom segue `_memoria/preferencias.md`. Sem "soluções inovadoras", "sinergia", "parceria de sucesso"
- Salvar sempre com data no nome: proposta nova não sobrescreve a anterior
