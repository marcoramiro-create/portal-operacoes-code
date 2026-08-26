import { Client } from "pg";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL não está configurada.");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const result = await client.query(`
    select
      (select count(*) from public.portal_users) as portal_users,
      (select count(*) from auth.users) as auth_users,
      (select count(*) from public.access_profiles) as access_profiles,
      (select count(*) from public.application_nodes) as application_nodes
  `);
  const users = await client.query(`
    select
      portal.email,
      portal.status,
      portal.is_development_admin,
      auth.email_confirmed_at is not null as email_confirmed,
      auth.last_sign_in_at is not null as signed_in,
      coalesce(array_agg(profile.profile_key) filter (where profile.profile_key is not null), '{}') as profiles
    from public.portal_users portal
    left join auth.users auth on auth.id = portal.auth_user_id
    left join public.user_profile_assignments assignment on assignment.user_id = portal.id
    left join public.access_profiles profile on profile.id = assignment.profile_id
    where lower(portal.email) in ('marco.ramiro@megatec.com.br', 'marcoramiro@gmail.com')
    group by portal.email, portal.status, portal.is_development_admin, auth.email_confirmed_at, auth.last_sign_in_at
    order by portal.email
  `);
  console.log(JSON.stringify({ ...result.rows[0], users: users.rows }));
} finally {
  await client.end();
}
