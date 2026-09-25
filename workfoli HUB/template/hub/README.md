# Instalação do Workfoli Hub

Esta pasta é a **configuração do Hub desta empresa** (CLIENT CONFIG). Ela foi criada pelo
`workfoli hub install` a partir do template canônico e pode ser versionada: não contém dados
operacionais nem segredos.

| Arquivo / pasta | Para que serve |
|---|---|
| `workfoli.hub.json` | Modo (local/remoto), porta, tema, IA, módulos desligados e módulos customizados |
| `modules/<id>/module.json` | Módulos declarativos desta empresa (CUSTOM MODULES). Sem código executável |

O código do Hub (Core) não mora aqui: ele é atualizado pelo `workfoli update` sem tocar nesta pasta.
Dados operacionais ficam em `../data`, arquivos privados em `../files` e credenciais em `../secrets`.
