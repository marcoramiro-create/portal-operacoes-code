export type RegistryKind = "EMPRESA" | "FILIAL" | "UNIDADE" | "CENTRO_CUSTO" | "DEPARTAMENTO" | "CARGO" | "ARMAZEM" | "LOCAL_ESTOQUE" | "FUNCIONARIO";
export type RegistryNode = { id: string; kind: RegistryKind; code: string; name: string; parentId?: string; active: boolean };
export type RegistryValidation = { valid: boolean; blockers: string[]; warnings: string[] };

const parentKinds: Partial<Record<RegistryKind, RegistryKind[]>> = {
  FILIAL: ["EMPRESA"],
  UNIDADE: ["EMPRESA", "FILIAL"],
  CENTRO_CUSTO: ["UNIDADE", "FILIAL"],
  DEPARTAMENTO: ["EMPRESA"],
  CARGO: ["EMPRESA"],
  ARMAZEM: ["FILIAL"],
  LOCAL_ESTOQUE: ["ARMAZEM"],
  FUNCIONARIO: ["EMPRESA", "FILIAL", "CENTRO_CUSTO", "DEPARTAMENTO", "CARGO", "FUNCIONARIO"],
};

export function validateRegistryHierarchy(nodes: RegistryNode[]): RegistryValidation {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const seenCodes = new Set<string>();
  for (const node of nodes) {
    if (!node.id || !node.code || !node.name) blockers.push(`cadastro_incompleto_${node.kind}_${node.id || "sem_id"}`);
    const codeKey = `${node.kind}|${node.code.trim().toUpperCase()}`;
    if (seenCodes.has(codeKey)) blockers.push(`codigo_duplicado_${codeKey}`);
    seenCodes.add(codeKey);
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (!parent) blockers.push(`pai_inexistente_${node.id}`);
      else if (!(parentKinds[node.kind] ?? []).includes(parent.kind)) blockers.push(`pai_invalido_${node.id}_${parent.kind}`);
      if (parent?.active === false && node.active) blockers.push(`filho_ativo_com_pai_inativo_${node.id}`);
      if (parent?.id === node.id) blockers.push(`auto_referencia_${node.id}`);
    } else if (node.kind !== "EMPRESA" && node.kind !== "DEPARTAMENTO" && node.kind !== "CARGO") {
      blockers.push(`hierarquia_sem_pai_${node.id}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) { blockers.push(`ciclo_hierarquico_${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const parentId = byId.get(id)?.parentId;
    if (parentId && byId.has(parentId)) visit(parentId);
    visiting.delete(id);
    visited.add(id);
  };
  nodes.forEach(node => visit(node.id));
  if (nodes.filter(node => node.kind === "EMPRESA" && node.active).length === 0) warnings.push("nenhuma_empresa_ativa");
  return { valid: blockers.length === 0, blockers, warnings };
}

export function canReferenceRegistryNode(nodes: RegistryNode[], id: string, expectedKind: RegistryKind): boolean {
  const node = nodes.find(item => item.id === id);
  return Boolean(node?.active && node.kind === expectedKind);
}
