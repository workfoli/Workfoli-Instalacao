# instances/ — instalações das empresas (privado)

Cada subpasta é a Workfoli de **uma** empresa: Base, configuração do Hub, dados operacionais, arquivos privados e
credenciais. Nada aqui é modelo e nada daqui volta para `workfoli BASE` ou `workfoli HUB`.

Esta pasta fica fora do Git (só este README é versionado). Não compartilhe as instâncias: elas contêm dados
privados e segredos.

Criar uma empresa (na pasta `workfoli HUB`):

```powershell
node bin/workfoli.mjs init nome-da-empresa --name "Nome da Empresa" --profile services
```

Backup: pare o Hub e copie a pasta da instância inteira para um destino cifrado.
