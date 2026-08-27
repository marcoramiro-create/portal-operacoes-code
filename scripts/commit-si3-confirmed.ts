import { readFile } from "node:fs/promises";
import { commitSi3CostCenters } from "../server/protheusImportPreviews";
import { getSupabasePool } from "../server/supabasePortal";

const path = process.argv[2];
if (!path) throw new Error("Informe o caminho do CSV SI3.");

const database = getSupabasePool();
const identityResult = await database.query<{ id: string; email: string; display_name: string | null; is_development_admin: boolean; profile_keys: string[] | null }>(
  `select u.id, u.email, u.display_name, u.is_development_admin,
     coalesce(array_agg(p.profile_key) filter (where p.profile_key is not null), '{}') as profile_keys
   from public.portal_users u
   left join public.user_profile_assignments assignment on assignment.user_id = u.id
   left join public.access_profiles p on p.id = assignment.profile_id
   where u.email = $1 and u.status = 'active'
   group by u.id`,
  ["marco.ramiro@megatec.com.br"],
);
const row = identityResult.rows[0];
if (!row) throw new Error("Usuário administrador ativo não encontrado.");

const result = await commitSi3CostCenters(await readFile(path, "utf8"), {
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  isDevelopmentAdmin: row.is_development_admin,
  profiles: row.profile_keys ?? [],
});
console.log(JSON.stringify(result, null, 2));
await database.end();
