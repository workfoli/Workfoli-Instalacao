---
name: perfil-instagram
description: >
  Audita e reescreve o perfil do Instagram de ponta a ponta: foto, campo de nome (o que a busca do
  Instagram indexa), @, bio de 150 caracteres, link, categoria, destaques, as 9 primeiras posições
  da grade e os posts fixados, com nota por item e versões de antes e depois. Use quando o usuário
  disser "analisa meu perfil", "melhora minha bio", "o que eu ponho nos destaques", "auditoria do
  instagram", "meu perfil não converte" ou /perfil-instagram.
---

# /perfil-instagram — Perfil que transforma visita em seguidor

A decisão de seguir acontece no topo do perfil e nas duas ou três primeiras linhas da grade: foto, nome, bio, link e a grade de relance. É isso que esta skill arruma.

## Dependências

- **Negócio:** `_memoria/empresa.md` (o que faz, pra quem, região, contato, diferenciais)
- **Foco:** `_memoria/estrategia.md` (o objetivo do perfil vem daqui)
- **Voz:** `_memoria/preferencias.md`
- **Marca:** `identidade/design-guide.md` (capas dos destaques e consistência da grade)
- **Saída:** `marketing/instagram/perfil-<YYYY-MM-DD>.md`

## Workflow

### Passo 1 — Entrada

- **Estado atual:** print do topo do perfil + primeiras linhas da grade (o mais confiável), ou o texto do nome, da bio e do link colados. O @ sozinho não basta: o Workfoli não lê o Instagram
- **Objetivo do perfil:** crescer a audiência, vender um produto, conseguir clientes, ou ganhar autoridade. Muda o CTA da bio, o link e os fixados. Sugerir a partir de `_memoria/estrategia.md`
- **Tipo de conta:** pessoal, criador ou empresa (criador e empresa liberam categoria e painel profissional)
- **Opcional:** os posts que mais deram certo, pra escolher fixados e ordem da grade

### Passo 2 — Nota dos 9 itens

| # | Item | Passa quando |
|---|---|---|
| 1 | **Foto** | rosto ou logo nítido, preenche o círculo, alto contraste, fundo limpo, legível pequeno |
| 2 | **Campo de nome** | nome + a palavra que as pessoas buscam, até 30 caracteres (é este campo que a busca indexa, não o @) |
| 3 | **@** | curto, fácil de lembrar, igual à marca, sem número ou _ se der |
| 4 | **Bio** | valor + assunto + uma prova em até 150 caracteres; começa pelo que o seguidor ganha; sem chuva de emoji |
| 5 | **Link** | um, ligado ao objetivo (WhatsApp, agenda, loja, página); se precisar de vários, uma página de links organizada |
| 6 | **Categoria** | definida (criador/empresa), um rótulo claro do nicho que reforça a bio |
| 7 | **Destaques** | 4 a 6, na ordem da próxima dúvida do visitante, capas consistentes, nomes curtos que não cortam |
| 8 | **Grade (9 primeiros)** | visual consistente, legível de relance, mostra variedade sem bagunça |
| 9 | **Fixados** | até 3, cada um a melhor prova do que o seguidor vai receber, ligada ao objetivo |

Nota: **passa / precisa melhorar / reprova**.

### Passo 3 — Reescrever o que não passa

- **Campo de nome:** `Nome | palavra buscada`, até 30 caracteres. Ex.: "Ana Ribeiro | Confeitaria". É a correção de maior efeito no perfil
- **Bio (150):** quem você ajuda + sobre o que posta + uma prova ou especificidade. Começar pelo benefício, não pelo cargo. Negócio local: cidade ou bairro na bio. Quebras de linha e um emoji-âncora ok. Entregar 2 opções com a contagem de caracteres
- **Link:** um, ligado ao objetivo. Negócio que vende por WhatsApp: link direto pro WhatsApp com mensagem pronta (gerado pelo `/whatsapp link`)
- **Categoria:** um rótulo que reforça a bio sem repetir
- **Destaques:** 4 a 6, da esquerda pra direita na ordem da próxima pergunta do visitante (ex.: Comece aqui → Cardápio/Serviços → Clientes → Dúvidas → Como pedir). Capas no estilo de `identidade/design-guide.md`, nomes de uma palavra
- **Grade:** a vitrine é julgada como conjunto. Apontar quais posts do topo reordenar ou substituir
- **Fixados:** até 3, ligados ao objetivo: um post que deu certo, uma oferta clara e uma apresentação ("pra quem é isto")
- **Foto:** rosto preenchendo o círculo ou logo com contraste; detalhe some, contraste não

Depoimento ou "prova" na bio só com dado real do usuário: nunca inventar número de clientes, anos de mercado ou nota.

### Passo 4 — Teste do topo

Ler só foto + nome + bio + link + primeira linha da grade e perguntar: **um desconhecido seguiria só com isso?** Responder com honestidade.

### Passo 5 — Entregar

```
Perfil @<conta> · Objetivo: conseguir clientes

Nota:
1 Foto: passa
2 Nome: reprova → "Ana Ribeiro | Confeitaria" (25/30)
4 Bio: precisa melhorar → 2 opções abaixo
...

Prioridades (maior efeito primeiro):
1. Campo de nome com a palavra buscada
2. Bio começando pelo benefício
3. Fixar os 3 posts certos

Antes → depois:
Bio antes: "Apaixonada por doces ✨🍰💕 Faço com amor"
Bio depois (A): "Bolos e doces pra festas em Curitiba\nEncomendas com 7 dias de antecedência\n👇 pedidos pelo WhatsApp" (96/150)
...

Teste do topo: hoje não passa (não diz o que vende nem onde). Com as mudanças, passa.
```

Salvar em `marketing/instagram/perfil-<YYYY-MM-DD>.md`. As mudanças são feitas pelo próprio usuário no app; nada é alterado na conta pelo Workfoli.

Se o nome, a bio ou o @ mudarem, perguntar se deve atualizar `Redes sociais` em `_memoria/empresa.md`.

## Regras

- O topo precisa passar no teste do topo
- Bio começa pelo benefício do leitor, não pelo cargo
- O campo de nome sempre leva uma palavra buscável
- Toda reescrita dentro dos limites (bio 150, nome 30), com a contagem
- Destaques e grade são julgados como conjunto
- No máximo um travessão na bio; nada de "potencializar", "transformar vidas", "experiência única"

## Créditos

Adaptado do `ig-profile-optimizer` do [instagram-skills](https://github.com/sergebulaev/instagram-skills) (MIT, Sergey Bulaev).
