import { previewRegistrationImport } from "../server/registrationImports";

const preview = await previewRegistrationImport("products", [{
  codigo_produto: "VALIDACAO-SEM-GRAVACAO",
  nome_produto: "Validação sem gravação",
  tipo_produto: "teste",
  ativo: "SIM",
}]);

if (!preview.valid || preview.totalRows !== 1) throw new Error("A pré-validação externa de produtos não retornou o resultado esperado.");
console.log(JSON.stringify({ registration_preview: "ok", rows_validated: preview.totalRows }));
