# servicos/ — o que a empresa oferece

Um arquivo por serviço ou produto: `servicos/<id>.md`. O `id` é o mesmo usado em
`workfoli.base.json` → `services[]` (letras minúsculas e hífens, ex.: `consultoria-inicial`).

Cada serviço entra também no manifesto, para os agentes o encontrarem sem varrer pastas:

```json
{ "id": "consultoria-inicial", "name": "Consultoria inicial", "summary": "Uma frase clara.", "path": "servicos/consultoria-inicial.md", "status": "active", "visibility": "public" }
```

## Modelo de arquivo

```markdown
# [Nome do serviço]

## Para quem é
## O que resolve
## Como funciona (etapas)
## O que está incluído / o que não está
## Prazos e formato de entrega
## Perguntas frequentes
```

Preço só entra se a empresa pedir; nunca inventar valores (`[A CONFIRMAR]`).
