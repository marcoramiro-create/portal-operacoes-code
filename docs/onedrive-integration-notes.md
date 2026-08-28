# Integração inicial com OneDrive

A documentação oficial da Microsoft indica que o acesso delegado aos arquivos deve usar OAuth 2.0 Authorization Code com PKCE e OpenID Connect, evitando que a aplicação receba ou armazene a senha do usuário. Para leitura, o escopo delegado Files.Read é o ponto de menor privilégio entre as permissões gerais de arquivos; escopos mais amplos como Files.Read.All devem ser evitados na primeira versão. A leitura de conteúdo deve usar o recurso driveItem e suas relações de pasta/filho no Microsoft Graph.

Referências consultadas:

- https://learn.microsoft.com/en-us/graph/permissions-reference
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

Decisão preliminar: antes de implementar chamadas no portal, é necessário conectar um conector Microsoft/Graph oficial ou fornecer um aplicativo OAuth registrado com client ID, redirect URI e escopo aprovado. A primeira validação deve ler somente uma pasta de importação escolhida pelo usuário, sem escrita, exclusão ou sincronização automática.


## Validação do link compartilhado

O link informado está acessível sem autenticação e abre a pasta `Portal Operações`. Foram encontradas as pastas `01_Importacoes_Originais` (5 itens), `02_Exportacoes`, `03_Recebimentos_NF`, `04_Backups_Banco`, `05_Backups_Codigo` e `06_Manuais_e_Processos`. Para reduzir exposição, o portal deverá consumir inicialmente somente `01_Importacoes_Originais`; as pastas de backups e manuais não devem ser lidas pelo importador. O link deve permanecer com permissão somente de visualização.
