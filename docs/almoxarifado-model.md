# Modelo inicial: Almoxarifado, requisições e responsabilidade

## Objetivo operacional

O módulo controla consumíveis, EPIs, uniformes e ferramentas a partir do item de compra já cadastrado como produto. O saldo é mantido por local de estoque, com políticas de reposição por armazém e operações separadas para cada fato operacional.

| Camada | Responsabilidade |
|---|---|
| Empresa e filial | Identificação jurídica e operacional da unidade de negócio. |
| Armazém e local | Posição física de estoque; cada armazém tem saldo e níveis próprios. |
| Tipo de produto | Classificação extensível, como consumível, EPI, uniforme ou ferramenta. |
| Produto | Item de compra que recebe atributos de lote, validade, CA e tamanho quando aplicáveis. |
| Operação | Documento auditável de requisição, entrada por compra/NF, inventário, ajuste, transferência, atendimento ou devolução. |
| Movimento | Efeito de cada linha da operação sobre o saldo físico de um local. |
| Responsabilidade | Histórico da ferramenta entregue, do funcionário responsável, do atendente e das condições de entrega e devolução. |

## Regras confirmadas

O requisitante é um usuário associado a funcionário ativo. O atendimento é feito por usuário com autorização específica de almoxarifado, sem aprovação inicial. A data prevista de retirada é sugerida na abertura da requisição e o atendimento parcial é permitido.

Entradas por compra ou NF recebem itens e quantidades informados pelo almoxarife e podem vincular a chave de NF já registrada. O inventário inicial ou ajuste forma e corrige o saldo físico, sempre com justificativa e auditoria. A leitura futura de XML ou o cruzamento com NF Legal poderá automatizar a criação das linhas de entrada.

Os níveis mínimo, máximo, segurança para 30 dias e cobertura para 60 dias são definidos por armazém. Armazéns como 10 e 11 têm níveis e consumo próprios, mesmo usando a identificação fiscal da filial vinculada.
