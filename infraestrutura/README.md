# infraestrutura/ — o mapa técnico da empresa (sem segredos)

Onde cada coisa roda e quem é responsável, para que o próximo trabalho não comece do zero:

| Item | Onde | Conta / responsável | Observações |
|---|---|---|---|
| Domínio | [registro.br / Cloudflare] | [conta da empresa] | |
| Site | [Vercel / hospedagem] | | |
| Repositórios | [GitHub: organização] | | |
| E-mail | [Google Workspace] | | |
| Anúncios | [Google Ads / Meta] | | |

As integrações também entram em `workfoli.base.json` → `integrations[]`, apenas com o **nome** das
credenciais (ex.: `GITHUB_TOKEN`). Os valores ficam no `.env` local ou em `secrets/`, ambos
ignorados pelo Git. Nunca escreva senha, token ou chave aqui nem em outro arquivo versionado.
