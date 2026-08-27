# Validação de Cadastros Centralizados

Em 27 de agosto de 2026, a sessão administrativa confirmou visualmente que a árvore lateral publicada apresenta os itens individuais de Cadastros, incluindo Empresas, Filiais, Armazéns, Locais de estoque, Unidades, Centros de custo, Tipos de produto e Usuários.

Na primeira abertura da rota de Produtos, a árvore atualizada estava disponível, mas o conteúdo do formulário ainda exibiu a versão anterior. Após a propagação e novo carregamento sem cache, a rota publicada exibiu corretamente o cadastro único de Produtos com seleção de tipo de produto, categoria operacional, unidade de medida e controles de tamanho, lote, validade e CA.

Na primeira abertura da rota publicada de Empresas após a inclusão dos controles de manutenção e Excel, o cadastro básico foi apresentado sem os novos cartões de arquivo. A verificação será repetida com recarregamento sem cache após a propagação da publicação.

Após aguardar a propagação e recarregar a página, o cadastro básico continuou visível, enquanto os controles de arquivo ainda não foram renderizados. O checkpoint contém os controles, portanto a verificação deve ser repetida após a confirmação de disponibilidade da implantação.

Após a confirmação de disponibilidade e uma nova recarga, o cadastro publicado de Empresas exibiu corretamente os cartões de baixar leiaute Excel, exportar registros e selecionar/importar planilha, sem criar dados de demonstração.

Na primeira abertura da rota publicada de Funcionários após a ampliação, foram exibidos os campos anteriores. A página será recarregada após a janela de propagação antes de concluir a validação visual.

Após a implantação ser confirmada, o cadastro publicado de Funcionários exibiu corretamente empresa, filial, unidade, centro de custo, departamento, cargo, gestor, data de admissão e a seleção de requisitante de almoxarifado. Nenhum registro de demonstração foi inserido.
