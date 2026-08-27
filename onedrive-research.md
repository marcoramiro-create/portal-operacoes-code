# Alternativas para OneDrive pessoal

A tela de Integrações do projeto não apresenta conector nativo de OneDrive; a configuração atual também não possui conector correspondente.

A documentação oficial do Microsoft Graph informa que o OneDrive pessoal é exposto como um drive do usuário e que a API permite listar, ler, gravar e reagir a alterações de arquivos. Fonte: https://learn.microsoft.com/en-us/graph/onedrive-concept-overview

Para reduzir o alcance da integração, a Microsoft documenta a permissão delegada `Files.ReadWrite.AppFolder`. Ela limita o aplicativo à pasta própria da aplicação no OneDrive, em vez de conceder acesso amplo a todos os arquivos. A conta continua controlando o conteúdo dessa pasta. Fonte: https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder

Alternativas identificadas:

| Alternativa | Resultado | Observação |
|---|---|---|
| Microsoft Graph com aplicativo próprio | Integração direta no portal, com upload e leitura automatizados | Exige registrar aplicativo Microsoft, configurar OAuth e obter consentimento; recomenda-se Files.ReadWrite.AppFolder |
| Automação externa baseada em OneDrive | Uma pasta sincronizada dispara cópia/entrega para o portal | Exige configurar um serviço externo e uma credencial/webhook; aumenta dependências e pontos de falha |
| Upload manual no portal + backup externo | Mantém o portal funcional sem integração externa imediata | Não automatiza a leitura da pasta OneDrive, mas permite continuar o trabalho com menor complexidade |

Recomendação técnica preliminar: começar com upload manual no portal enquanto a integração Microsoft Graph é preparada, evitando credenciais amplas e sem apagar as cargas já existentes. Se o usuário aceitar registrar um aplicativo Microsoft, implementar OAuth delegado com `Files.ReadWrite.AppFolder` e salvar apenas referências/metadados no banco do portal. A sincronização deve ser idempotente e preservar o histórico.
