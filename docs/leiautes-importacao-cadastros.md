# Leiautes e importação de cadastros

## Fluxo de uso

Cada tela de cadastro apresenta o mesmo fluxo: primeiro use **Baixar leiaute Excel**; em seguida, preencha somente a primeira aba, sem mudar os nomes das colunas; depois selecione o arquivo, clique em **Validar planilha** e corrija qualquer erro indicado por linha e coluna. A ação **Importar** somente é liberada quando toda a planilha estiver válida.

As importações gravam os dados no Supabase de homologação. A planilha não é usada como banco de dados. Para evitar alterações involuntárias, uma nova importação atualiza o registro que tiver o mesmo código único.

| Cadastro | Local no portal | Chave de atualização | Observação importante |
|---|---|---|---|
| Usuários | Administração → Usuários e solicitações → Importar por Excel | E-mail | A criação fica pendente; o convite de ativação é disparado separadamente pela Administração. |
| Funcionários | Cadastros → Funcionários | Código do funcionário | Unidade e centro de custo podem ficar em branco até esses cadastros auxiliares existirem. |
| Fornecedores | Cadastros → Fornecedores | Código do fornecedor | CNPJ/CPF, se preenchido, deve ser único. |
| Produtos | Cadastros → Produtos | Código do produto | O tipo de produto pode ser usado livremente nesta etapa. |

## Colunas dos leiautes

| Cadastro | Colunas obrigatórias | Colunas opcionais |
|---|---|---|
| Usuários | `nome`, `email`, `perfil` | `ativo` |
| Funcionários | `codigo_funcionario`, `nome_completo` | `email`, `codigo_unidade`, `codigo_centro_custo`, `ativo` |
| Fornecedores | `codigo_fornecedor`, `razao_social` | `nome_fantasia`, `cnpj_cpf`, `ativo` |
| Produtos | `codigo_produto`, `nome_produto` | `tipo_produto`, `ativo` |

> A coluna `ativo` aceita **SIM** ou **NÃO**. Quando ela estiver vazia, o sistema considera o registro como ativo.

Para usuários, os perfis aceitos são `operations-admin`, `manager`, `operator` e `viewer`. O perfil `development-admin` não é importado por planilha: ele permanece reservado à administração técnica do portal.

## Cadastro direto e permissões

Além da importação por planilha, os quatro cadastros permitem inclusão direta na própria tela, desde que a pessoa tenha essa liberação. O padrão aprovado para os perfis é apresentado abaixo; na tela **Administração → Usuários e solicitações → Liberações por usuário**, o administrador pode criar exceções por pessoa e por cadastro.

| Perfil | Consultar | Cadastrar diretamente | Importar planilha | Administrar liberações |
|---|---:|---:|---:|---:|
| Administrador técnico | Sim | Sim | Sim | Sim |
| Administrador operacional | Sim | Sim | Sim | Sim |
| Gestor aprovador | Sim | Sim | Não | Não |
| Usuário operacional | Sim | Não | Não | Não |
| Consulta | Sim | Não | Não | Não |

O cadastro direto usa as mesmas validações do leiaute. Repetir um código de funcionário, fornecedor ou produto atualiza o registro correspondente; repetir um e-mail de usuário atualiza a pessoa, mas não altera o administrador técnico por planilha ou por formulário direto.

## Validações aplicadas

O portal verifica campos obrigatórios, e-mails, valores de ativo, perfis permitidos e duplicidades dentro da própria planilha. Para funcionários, quando forem informados, os códigos de unidade e de centro de custo também são consultados no Supabase antes da importação. Cada execução está limitada a 500 linhas para que os erros sejam fáceis de revisar e corrigir.
