---
name: abrir
description: >
  Abre a sessão de trabalho: confere a memória do negócio (empresa, preferências, estratégia) e as
  pendências de `tarefas.md`, e devolve um resumo de poucas linhas pra começar. Use quando o
  usuário disser "abrir", "/abrir", "começar o dia", "vamos trabalhar", "onde paramos?" ou no
  primeiro turno de uma sessão depois do /instalar.
---

# /abrir — Abertura de sessão

Curto e direto: confirmar que o contexto está carregado e mostrar onde paramos.

## Workflow

1. A memória (`_memoria/empresa.md`, `_memoria/preferencias.md`, `_memoria/estrategia.md`) já vem carregada pelas regras compartilhadas. Se por algum motivo o conteúdo não estiver no contexto, ler os três arquivos.

2. Se algum dos três ainda estiver em branco (só os campos vazios do molde), responder:
   > "`_memoria/<arquivo>.md` ainda não foi preenchido. Quer rodar o `/instalar` agora?"

   E parar.

3. Ler `tarefas.md` (se existir) e pegar até 3 pendências abertas (`- [ ]`) da seção "Agora". Se "Agora" estiver vazia, olhar "Próximas".

4. Olhar "Prazos e datas" em `_memoria/estrategia.md`. Se houver data vencida ou nos próximos 7 dias, gerar um aviso de uma linha.

5. Devolver UMA mensagem neste formato:

```
[Nome do negócio] — [o que faz, em 5-8 palavras]
Foco: [prioridade principal, em uma frase]
Pendências: [até 3 itens, separados por " · "]
[Aviso de prazo]

O que vamos fazer?
```

Omitir a linha de pendências se não houver nenhuma, e a de aviso se não houver prazo próximo.

## Regras

- No máximo 6 linhas no terminal
- Não listar os arquivos lidos nem confirmar leitura
- Nenhuma pergunta além de "O que vamos fazer?"
- Design-guide em branco não é assunto aqui: só importa quando uma skill visual for chamada
