# Conciliação read-only — Autopeças 0303 / agregado 301010414-MGT

**Data:** 23/11/2026  
**Status:** primeira conciliação local; nenhum banco remoto, código funcional ou ambiente Oracle alterado.

## 1. Caso selecionado

- **Segmento:** Autopeças
- **Filial:** `0303`
- **Agregado:** `301010414-MGT`
- **Descrição:** Tambor de freio 16,5x8 Outboard
- **Produto focal:** `100000142456`
- **Armazém:** `01`
- **Período de teste:** janeiro a março de 2025
- **CFOPs aceitos:** `1101`, `1102`, `1117`, `1401`, `1403`, `1922`, `2102`, `2403`
- **CFOP efetivamente encontrado neste caso:** `2102`

O agregado foi escolhido porque possui entradas em mais de um mês e produtos/códigos relacionados com custo positivo na SB9. O produto focal aparece na SB1 com o agregado informado e tipo `ME`.

## 2. Fontes utilizadas

| Fonte | Uso | SHA-256 |
|---|---|---|
| `SB1-resumida.csv` | vínculo produto → agregado, descrição e tipo | `bdc9d3550d47296ef65cffbd4ea85231d5c4e820b4762f0a87f3df2c3511d8e3` |
| `SD1-resumida.csv` | quantidade, valor, produto, CFOP, documento e data da operação | `708c3d85e699b7342857ed820156c6ed6aeed41f386e7b379ad461350e33d272` |
| `SF1-resumida.csv` | data de recebimento e validação do documento | `46bb147198abf564a97136a28e47bc441074aee5b608a1b06a2e2de9ef52c94f` |
| `SB9-resumida.csv` | comparação independente do custo unitário mensal | `560d1bedb0aa1eb4b167a6605b4e9d427b801894848f3ae9c55b6e0907bd52bc` |

O vínculo SD1 → SF1 foi feito por filial, número do documento e série. Cada linha do caso focal encontrou exatamente um cabeçalho SF1.

## 3. Fórmula aplicada

A competência da entrada foi definida pelo mês de `SF1.Dt. Receb.`. Para cada produto e mês:

```text
custo médio de entrada = soma(SD1.Vlr.Total) / soma(SD1.Quantidade)
```

Somente linhas de SD1 com os CFOPs aprovados foram consideradas. A SB9 não participou do cálculo; foi usada somente para comparação.

## 4. Resultado do produto focal

| Mês | Documento | Quantidade | Valor da entrada | Custo médio de entrada | Custo SB9 | Diferença | Diferença % |
|---|---:|---:|---:|---:|---:|---:|---:|
| 01/2025 | `000007303 / 100` | 64 | R$ 26.902,40 | R$ 420,3500 | R$ 383,9860 | R$ 36,3640 | 9,47% |
| 02/2025 | — | 0 | R$ 0,00 | não calculado | sem entrada focal | — | — |
| 03/2025 | `000007598 / 100` e `000072236 / 2` | 128 | R$ 60.736,80 | R$ 474,5063 | R$ 420,2450 | R$ 54,2613 | 12,91% |

## 5. Leitura inicial

1. O produto focal tem três entradas no trimestre: uma em janeiro e duas em março.
2. Em março, os preços unitários foram R$ 420,35 e R$ 507,00; por isso o custo médio ponderado do mês é R$ 474,5063, e não R$ 420,35.
3. A comparação com a SB9 diverge 12,91% em março e 9,47% em janeiro. Isso impede assumir que a SB9 seja automaticamente o custo de entrada correto para a análise evolutiva.
4. Fevereiro não deve ser preenchido com zero. Deve permanecer como mês sem entrada; eventual linha contínua no gráfico deverá ser uma escolha visual explícita, carregando o último preço válido e exibindo sua origem.
5. O agregado possui outros códigos e variantes. A conciliação do agregado completo exige consolidar todos os produtos vinculados pela SB1, sem misturar códigos apenas semelhantes por descrição.

## 6. Resultado agregado no trimestre

Considerando todas as linhas do agregado `301010414-MGT` recebidas em 01/2025–03/2025 e os CFOPs aprovados:

| Mês | Linhas | Quantidade | Valor | Custo médio ponderado |
|---|---:|---:|---:|---:|
| 01/2025 | 1 | 64 | R$ 26.902,40 | R$ 420,3500 |
| 02/2025 | 0 | 0 | R$ 0,00 | não calculado |
| 03/2025 | 4 | 410 | R$ 186.362,16 | R$ 454,5419 |

A diferença entre o preço focal e o preço agregado em março é esperada: outros produtos/códigos do mesmo agregado tiveram preços unitários diferentes e precisam permanecer identificáveis no detalhamento.

## 7. Conclusão da primeira etapa

O caso confirma que a arquitetura proposta é tecnicamente viável com as fontes locais e que o custo de entrada deve ser calculado a partir de SD1/SF1, com SB1 como hierarquia e SB9 como comparação/auditoria.

Ainda não é suficiente para criar o read model definitivo. Antes disso, é necessário:

1. repetir a conciliação do mesmo produto em outra filial;
2. verificar devoluções, transferências e demais CFOPs na amostra ampliada;
3. comparar o agregado completo com a planilha/RM BIS do usuário;
4. executar o caso equivalente da Indústria na filial 0105, armazéns 01 e 20;
5. somente então definir as tabelas versionadas de fatos e a integração da tela.

Nenhuma migração, importação, reconstrução ou alteração remota foi executada.
