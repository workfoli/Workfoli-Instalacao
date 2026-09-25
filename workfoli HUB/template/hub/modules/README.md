# Módulos customizados

Cada subpasta com um `module.json` vira um módulo do Hub **desta empresa**, depois de listada em
`workfoli.hub.json` → `modules.custom`. O módulo é declarativo: campos, rótulos e colunas. O Hub
guarda os registros no banco operacional da instância e aplica as mesmas permissões dos módulos
do Core (`<id>:read`, `<id>:write`).

Não use módulos customizados para dados clínicos ou sensíveis: eles ainda não têm os controles
específicos de saúde (consentimento, campos restritos, trilha de leitura).

Exemplo em `exemplo-agendamentos/module.example.json` (renomeie para `module.json` para usar).
