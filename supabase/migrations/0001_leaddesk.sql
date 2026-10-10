-- LeadDesk: leads table for Task B / Task C.
-- Columns follow materials/leads.json; the vocabulary follows the app:
-- status — LEAD_STATUSES in lib/types.ts, id — leadId() in lib/db.ts (lead_0001).

create table if not exists public.leads (
  id          text primary key check (id ~ '^lead_[0-9]{4}$'),
  full_name   text        not null,
  company     text        not null,
  email       text        not null,
  source      text        not null check (source in ('website', 'google-ads', 'facebook-ads', 'linkedin', 'referral', 'webinar')),
  status      text        not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  budget      integer     check (budget is null or budget >= 0),
  message     text        not null default '',
  created_at  timestamptz not null default now()
);

comment on table public.leads is 'LeadDesk leads: 20 synthetic rows, the same as materials/leads.json';
comment on column public.leads.status is 'new | contacted | qualified | won | lost (LEAD_STATUSES in lib/types.ts)';
comment on column public.leads.budget is 'Monthly budget in USD; null when the lead did not say';

create index if not exists leads_status_created_at_idx on public.leads (status, created_at desc);

-- The table holds personal data: no access for anon/authenticated through the Data API.
-- The MCP server works as the project owner and is not affected.
alter table public.leads enable row level security;
