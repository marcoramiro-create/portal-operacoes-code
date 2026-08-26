# Fundação do Portal Corporativo

## Decisões adotadas

O portal usará o **Supabase** como fonte externa de verdade para identidade, permissões, cadastros e auditoria. A autenticação será tratada pelo Supabase Auth; o portal não manterá senhas em suas tabelas. O fluxo próprio da empresa controlará a solicitação, aprovação, criação do vínculo com o funcionário, liberação de perfis e desativação de acesso.

Os arquivos importados, exportações e anexos continuarão sendo organizados no OneDrive. A conexão com o OneDrive será acrescentada depois da estabilização desta fundação, sem armazenar senhas ou credenciais de terceiros no repositório.

## Modelo inicial

| Domínio | Estrutura | Finalidade |
|---|---|---|
| Organização | Unidades e centros de custo | Vincular funcionários, movimentações e permissões operacionais. |
| Cadastros | Funcionários, fornecedores e produtos | Reutilizar os mesmos registros entre todos os módulos do portal. |
| Aplicações | Nós hierárquicos de aplicação | Formar o menu em árvore e registrar aplicações e subaplicações. |
| Acesso | Perfis, permissões por nó e atribuições aos usuários | Liberar visualização, administração ou aprovação para cada subaplicação. |
| Governança | Solicitações de acesso e auditoria | Rastrear pedido, aprovação, liberação e alterações relevantes. |

## Catálogo inicial de aplicações

```text
Portal Corporativo
├── Administração
│   ├── Usuários e solicitações
│   └── Perfis de acesso
├── Cadastros
│   ├── Funcionários
│   ├── Fornecedores
│   └── Produtos
├── Suprimentos e Estoques
│   ├── Compras e análise Protheus
│   ├── Consumo, giro e excedente da indústria
│   ├── Evolução de estoque de autopeças
│   ├── Evolução de custos de autopeças
│   ├── Evolução de custos da indústria
│   └── Ranking de fornecedores
├── Recebimentos
│   └── Leitura de chave de acesso de NF
├── Consumo e Entregas
│   └── Consumíveis, EPIs e uniformes
└── Ativos e Manutenção
    ├── Empilhadeiras
    ├── Equipamentos da indústria
    └── Ferramentas de oficinas e indústria
```

## Premissas pendentes para a interface de cadastros

Os formulários serão criados após confirmação dos campos obrigatórios de funcionários, fornecedores e produtos. A primeira migração mantém os atributos mínimos para identificação e status, permitindo complementação sem retrabalho na estrutura de permissões.
