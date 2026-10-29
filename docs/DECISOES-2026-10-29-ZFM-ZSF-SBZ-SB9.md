# Decisões operacionais — 2026-10-29

**Origem:** Manus + decisão do usuário  
**Projeto:** Portal de Operações Megatec  
**Ambiente:** local/Homologação; Produção intocada  
**Status:** registro de decisão; nenhuma alteração de banco ou deploy nesta etapa

## Decisões aprovadas

### Vínculo primário SB1 × SB9 × SBZ

A regra aprovada é:

```text
SB1.Codigo = SB9.Produto = SBZ.Codigo
```

Na SBZ, a chave completa de consulta continua sendo `filial + código`, portanto o vínculo é:

```text
SB1.Codigo = SB9.Produto = SBZ.Codigo
SBZ.Filial = filial da configuração
```

O campo `SB9.Cod. Produto` não será descartado. Ele permanecerá preservado para auditoria, validação e análise das 2.174 divergências identificadas no arquivo atual.

A validação adicional permitida é apenas de consistência, sem substituir a regra aprovada. O sistema poderá informar quando `Cod. Produto` também encontrar correspondência na SB1, quando não encontrar ou quando divergir, mas não poderá trocar silenciosamente a chave primária.

### OneDrive

O usuário autorizou prosseguir com a ativação do versionamento do OneDrive, por trazer proteção contra sobrescrita e permitir recuperação/histórico.

O relatório do Maestro confirmou que atualmente os três arquivos consultados possuem apenas a versão `1.0` acessível. A ativação ainda não foi executada pelo Manus nesta etapa, pois não há ferramenta direta autorizada no projeto local para alterar a configuração da biblioteca.

Até o versionamento ser confirmado, nenhuma rotina deve substituir automaticamente a SB9 existente sem retenção ou cópia de segurança.

## Ordem de implementação

1. Validar os cabeçalhos reais de ZFM e ZSF.
2. Criar testes de parser para cabeçalho na linha 4, zeros à esquerda e descrições preservadas.
3. Implementar parser reutilizando `readRowsWithHeader()` e `RegistrationResult`.
4. Definir materialização de ZFM/ZSF sem desligar `familyReferences` e `subfamilyReferences`.
5. Criar materialização paralela da SBZ por filial + produto, mantendo `sbzReferences`.
6. Validar paridade de `Entra MRP` antes de trocar qualquer leitura do MRP.
7. Implementar leitura Range da SB9 em Windows-1252, por blocos e com fronteira de linha.
8. Processar SB9 preservando `Produto` como chave primária e `Cod. Produto` como campo de auditoria.
9. Integrar SB9 à Evolução de Custos somente após testes e validação do vínculo.

## Regras que não podem ser alteradas

- Produção permanece congelada.
- O legado não será desligado nesta fase.
- `SB1.Codigo = SB9.Produto = SBZ.Codigo` é a chave de produto aprovada.
- `SB9.Cod. Produto` deve ser preservado.
- Família e SubFamília são relacionadas separadamente à SB1.
- ZFM e ZSF não devem ser relacionadas diretamente pelo mesmo código.
- SBZ deve preservar filial + produto.
- `Entra MRP` deve manter o significado do Protheus; não trocar por booleano sem validação de compatibilidade.
- Códigos textuais, zeros à esquerda e sufixos devem ser preservados.
- A SB9 não pode ser carregada integralmente em memória na VM.

## Critérios de aceite da SB9

- Arquivo atual: 262.443.696 bytes.
- Encoding: Windows-1252.
- Delimitador: ponto e vírgula.
- Cabeçalho: linha 3.
- Leitura por HTTP Range.
- Blocos sequenciais, sem paralelismo inicialmente.
- `0xA0` removido somente das bordas de `Cod. Produto`, com registro em auditoria.
- `Produto` preservado como chave primária.
- `Cod. Produto` preservado separadamente.
- `SBZ.Codigo` cruzado com `SB1.Codigo`, sempre considerando `SBZ.Filial`.
- Controle de duplicidade por eTag/hash, não pelo nome.
- Gravação em lotes.
- Nenhum deploy antes dos testes.
