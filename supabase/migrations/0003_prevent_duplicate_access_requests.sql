create unique index if not exists user_access_requests_one_pending_email
  on public.user_access_requests (lower(requested_email))
  where status = 'pending';
