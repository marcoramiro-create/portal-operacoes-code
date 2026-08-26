import { Pool } from "pg";

type ApplicationNodeRow = {
  id: string;
  node_key: string;
  label: string;
  parent_id: string | null;
  sort_order: number;
};

export type ApplicationTreeNode = {
  id: string;
  key: string;
  label: string;
  children: ApplicationTreeNode[];
};

let pool: Pool | null = null;

function getSupabasePool() {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) throw new Error("A conexão externa com o Supabase não está configurada.");
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 4 });
  }
  return pool;
}

export function buildApplicationTree(rows: ApplicationNodeRow[]): ApplicationTreeNode[] {
  const mapped = new Map<string, ApplicationTreeNode>();
  const roots: ApplicationTreeNode[] = [];

  rows.forEach(row => mapped.set(row.id, { id: row.id, key: row.node_key, label: row.label, children: [] }));
  rows.forEach(row => {
    const node = mapped.get(row.id)!;
    if (!row.parent_id) roots.push(node);
    else mapped.get(row.parent_id)?.children.push(node);
  });
  return roots;
}

export async function listApplicationTree() {
  const result = await getSupabasePool().query<ApplicationNodeRow>(
    "select id, node_key, label, parent_id, sort_order from public.application_nodes where active = true order by sort_order, label",
  );
  return buildApplicationTree(result.rows);
}
