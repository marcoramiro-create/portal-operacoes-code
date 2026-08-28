# Integração inicial com OneDrive

A documentação oficial da Microsoft indica que o acesso delegado aos arquivos deve usar OAuth 2.0 Authorization Code com PKCE e OpenID Connect, evitando que a aplicação receba ou armazene a senha do usuário. Para leitura, o escopo delegado Files.Read é o ponto de menor privilégio entre as permissões gerais de arquivos; escopos mais amplos como Files.Read.All devem ser evitados na primeira versão. A leitura de conteúdo deve usar o recurso driveItem e suas relações de pasta/filho no Microsoft Graph.

Referências consultadas:

- https://learn.microsoft.com/en-us/graph/permissions-reference
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

Decisão preliminar: antes de implementar chamadas no portal, é necessário conectar um conector Microsoft/Graph oficial ou fornecer um aplicativo OAuth registrado com client ID, redirect URI e escopo aprovado. A primeira validação deve ler somente uma pasta de importação escolhida pelo usuário, sem escrita, exclusão ou sincronização automática.
