---
name: fechar
description: >
  Fecha a sessão de trabalho: resume o que foi feito, atualiza `tarefas.md` (concluídas pra Feito,
  pendências novas em Agora ou Próximas), registra decisões importantes em `conhecimento/` e
  pergunta se algo precisa ir pra memória. No fim, oferece o /salvar se houver mudança não salva.
  Use quando o usuário disser "fechar", "/fechar", "encerrar o dia", "por hoje é isso", "terminei",
  "fecha a sessão" ou "anota o que fizemos".
---

# /fechar — Fechamento de sessão

O par do `/abrir`. O objetivo é que a próxima sessão comece sabendo exatamente onde parou, sem depender de lembrar.

## Workflow

### Passo 1 — Levantar o que mudou

- Se a pasta for repositório Git: `git status --short` (o que ainda não foi salvo) e `git log --since=midnight --oneline` (o que já foi salvo hoje)
- Sem Git: arquivos modificados hoje
- Somar ao que aconteceu na conversa: entregas feitas, decisões tomadas, pendências que surgiram

Ignorar `dados/`, `node_modules/` e arquivos de sistema.

### Passo 2 — Atualizar `tarefas.md`

Mostrar a proposta antes de gravar:

- Itens concluídos nesta sessão → `[x]` e movidos pra **Feito**, com a data (`- [x] Carrossel sobre conservação de bolo (2026-10-03)`)
- Pendências novas que surgiram na conversa → **Agora** (se forem pra amanhã ou desta semana) ou **Próximas**
- Itens de "Agora" que perderam sentido → perguntar se saem

Não reescrever o arquivo: só mexer nas linhas afetadas.

### Passo 3 — Registrar decisões (só as que importam)

Decisão é o que muda como a empresa trabalha ou o que ela oferece: preço novo, serviço descontinuado, fornecedor trocado, regra de atendimento, foco do mês. Para cada uma, perguntar:

> "Decidimos <X> hoje. Quer que eu registre em `conhecimento/decisoes/`?"

Com aprovação, criar `conhecimento/decisoes/<YYYY-MM-DD>-<assunto>.md`:

```markdown
# <Decisão em uma frase>

**Data:** YYYY-MM-DD
**Contexto:** <por que o assunto apareceu>
**Decisão:** <o que foi decidido>
**Motivo:** <por quê>
**Impacto:** <o que muda: arquivos, processos, skills>
```

Aprendizados soltos ("o carrossel de mitos foi o que mais salvou") vão pra `conhecimento/notas/<YYYY-MM-DD>-<assunto>.md`, também só com aprovação.

### Passo 4 — Memória

Se a sessão mudou algo do contexto (cliente novo, serviço novo, foco diferente, preferência de tom, ferramenta conectada), perguntar uma vez:

> "Isso mudou algo no seu contexto. Quer que eu atualize a memória?"

E mostrar a linha que entraria em `_memoria/empresa.md`, `preferencias.md` ou `estrategia.md` antes de gravar. Mudança grande ou dúvida: sugerir o `/atualizar`.

### Passo 5 — Resumo

Uma mensagem, no máximo 8 linhas:

```
Sessão fechada.
Feito: <até 3 itens, separados por " · ">
Pendente: <até 3 itens de Agora>
Registrado: <decisões/notas criadas, se houver>
Próximo passo: <a primeira pendência de Agora>

Tem <N> arquivo(s) sem salvar no GitHub. Rodo o /salvar?
```

Omitir as linhas vazias. A pergunta do `/salvar` só aparece se `git status` mostrar mudança.

## Regras

- Nunca fazer commit ou push aqui: isso é do `/salvar`, e só com o "sim" do usuário
- Nada é gravado sem mostrar antes
- Não inventar o que foi feito: só o que aparece nos arquivos ou na conversa
- Nada de dado de cliente, paciente, telefone ou conversa em `tarefas.md` ou `conhecimento/`
- Sessão sem mudança: "Nada novo pra registrar hoje." e parar
