import { Client } from "pg";

const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const profiles = await client.query(`select p.id, p.profile_key, p.name, p.description, p.active, count(a.user_id)::int as assigned_users from public.access_profiles p left join public.user_profile_assignments a on a.profile_id = p.id group by p.id, p.profile_key, p.name, p.description, p.active order by p.profile_key, p.id`);
  const duplicateProfiles = await client.query(`select profile_key, count(*)::int as total, string_agg(id::text, ', ' order by id) as ids from public.access_profiles where active = true group by profile_key having count(*) > 1 order by profile_key`);
  const duplicateNodes = await client.query(`select node_key, count(*)::int as total, string_agg(id::text, ', ' order by id) as ids from public.application_nodes where active = true group by node_key having count(*) > 1 order by node_key`);
  const assignments = await client.query(`select u.email, array_agg(p.profile_key order by p.profile_key) as profiles from public.portal_users u left join public.user_profile_assignments a on a.user_id = u.id left join public.access_profiles p on p.id = a.profile_id group by u.id, u.email order by u.email`);
  console.log(JSON.stringify({ profiles: profiles.rows, duplicateProfiles: duplicateProfiles.rows, duplicateNodes: duplicateNodes.rows, assignments: assignments.rows }, null, 2));
} finally { await client.end(); }
