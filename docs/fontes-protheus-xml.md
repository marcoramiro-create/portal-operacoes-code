# Fontes XML do Protheus para cadastros

Os arquivos originais permanecem no OneDrive pessoal, em `Portal Operações → 01_Importacoes_Originais`, sem compartilhamento externo. A rotina será assistida: cada arquivo é analisado, uma prévia é apresentada e nenhuma atualização é aplicada sem confirmação explícita.

| Cadastro do portal | Rotina Protheus | Arquivo atual | Situação observada |
|---|---|---|---|
| Fornecedores | MATA020 | `mata020.xml` | Arquivo XML SpreadsheetML, 44,9 MB, com 6.978 linhas na planilha `01-0101 - Listagem do Browse`. |
| Armazéns | AGRA045 | `agra045.xml` | Fonte de armazéns do Protheus. Os locais de estoque do Portal permanecem referências internas vinculadas ao armazém. |

Os campos confirmados no cabeçalho da MATA020 incluem `Codigo`, `Loja`, `CNPJ/CPF`, `Razao Social` e `N Fantasia`. O mapeamento para o portal usa Código + Loja como identificação de fornecedor e importa somente registros ativos fornecidos na exportação. O AGRA045 traz `Codigo` e `Descricao`; o leitor recupera empresa e filial do nome da planilha no padrão `empresa-filial - Listagem do Browse`.
