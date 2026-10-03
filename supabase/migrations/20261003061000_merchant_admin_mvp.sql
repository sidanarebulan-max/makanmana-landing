create table public.merchant_admin_credentials (
 id integer primary key check (id=1), password_hash text not null, salt text not null,
 iterations integer not null default 210000, updated_at timestamptz not null default now()
);
create table public.merchant_admin_sessions (
 token_hash text primary key, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.merchant_admin_login_attempts (
 id bigint generated always as identity primary key, ip_hash text not null, created_at timestamptz not null default now()
);
create index merchant_admin_attempt_time on public.merchant_admin_login_attempts(ip_hash,created_at);
create table public.merchant_admin_reviews (
 entity_type text not null check(entity_type in ('registration','waitlist')), entity_id uuid not null,
 review_status text not null default 'new' check(review_status in ('new','reviewing','needs_info','contacted','ready','hold')),
 notes text not null default '' check(length(notes)<=10000), follow_up_at timestamptz,
 version integer not null default 1, updated_at timestamptz not null default now(),
 primary key(entity_type,entity_id)
);
create table public.merchant_admin_review_events (
 id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null,
 review_status text not null, notes text not null, follow_up_at timestamptz, created_at timestamptz not null default now()
);
create index merchant_admin_review_events_entity on public.merchant_admin_review_events(entity_type,entity_id,created_at desc);
create table public.site_activity_events (
 id uuid primary key, session_id uuid not null, event_type text not null check(event_type in ('page_view','cta_click','form_start','step_view','upload_start','submit_success','submit_error','form_leave')),
 page text not null check(length(page)<=200), target text check(length(target)<=80), referrer_host text check(length(referrer_host)<=160),
 utm_source text check(length(utm_source)<=80), utm_medium text check(length(utm_medium)<=80), utm_campaign text check(length(utm_campaign)<=120),
 device text not null check(device in ('mobile','desktop')), created_at timestamptz not null default now()
);
create index site_activity_time on public.site_activity_events(created_at desc);
create index site_activity_session on public.site_activity_events(session_id,created_at);
create table public.site_track_limits (ip_hash text not null, hour timestamptz not null, attempts integer not null default 1, primary key(ip_hash,hour));
do $$ declare t text; begin
 foreach t in array array['merchant_admin_credentials','merchant_admin_sessions','merchant_admin_login_attempts','merchant_admin_reviews','merchant_admin_review_events','site_activity_events','site_track_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from anon, authenticated',t);
 execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;
create function public.merchant_admin_save_review(p_type text,p_id uuid,p_status text,p_notes text,p_follow_up timestamptz,p_version integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare saved public.merchant_admin_reviews; current_version integer;
begin
 if p_type not in ('registration','waitlist') then raise exception 'invalid_entity'; end if;
 if p_type='registration' and not exists(select 1 from merchant_registrations where id=p_id) then raise exception 'not_found'; end if;
 if p_type='waitlist' and not exists(select 1 from merchant_waitlist where id=p_id) then raise exception 'not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_type||p_id::text,0));
 select version into current_version from merchant_admin_reviews where entity_type=p_type and entity_id=p_id;
 if coalesce(current_version,0)<>p_version then raise exception 'review_conflict'; end if;
 insert into merchant_admin_reviews(entity_type,entity_id,review_status,notes,follow_up_at) values(p_type,p_id,p_status,p_notes,p_follow_up)
 on conflict(entity_type,entity_id) do update set review_status=excluded.review_status,notes=excluded.notes,follow_up_at=excluded.follow_up_at,version=merchant_admin_reviews.version+1,updated_at=now() returning * into saved;
 insert into merchant_admin_review_events(entity_type,entity_id,review_status,notes,follow_up_at) values(p_type,p_id,p_status,p_notes,p_follow_up);
 return to_jsonb(saved);
end $$;
revoke all on function public.merchant_admin_save_review(text,uuid,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.merchant_admin_save_review(text,uuid,text,text,timestamptz,integer) to service_role;
create function public.site_track_reserve(p_ip text) returns boolean language plpgsql security invoker set search_path=public as $$
declare n integer; begin
 insert into site_track_limits(ip_hash,hour) values(p_ip,date_trunc('hour',now())) on conflict(ip_hash,hour) do update set attempts=site_track_limits.attempts+1 returning attempts into n;
 return n<=600;
end $$;
revoke all on function public.site_track_reserve(text) from public,anon,authenticated;
grant execute on function public.site_track_reserve(text) to service_role;
create function public.merchant_admin_analytics(p_days integer default 30) returns jsonb language sql security invoker set search_path=public as $$
with events as (select * from site_activity_events where created_at>=now()-make_interval(days=>least(greatest(p_days,1),90))),
daily as (select (created_at at time zone 'Asia/Kuala_Lumpur')::date as day,count(*) filter(where event_type='page_view') as views,count(distinct session_id) filter(where event_type='page_view') as sessions,count(*) filter(where event_type='form_start' and page='/daftar-kedai.html') as starts,count(*) filter(where event_type='submit_success' and page='/daftar-kedai.html') as completed from events group by 1),
sources as (select coalesce(nullif(utm_source,''),nullif(referrer_host,''),'Terus') as source,count(*) as views,count(distinct session_id) as sessions from events where event_type='page_view' group by 1),
pages as (select page,count(*) filter(where event_type='page_view') as views,count(*) filter(where event_type='form_start') as starts,count(*) filter(where event_type='submit_success') as completed from events group by 1),
steps as (select target,count(distinct session_id) as sessions from events where event_type='step_view' group by 1),
registrations as (select (created_at at time zone 'Asia/Kuala_Lumpur')::date as day,count(*) as total from merchant_registrations where created_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) group by 1)
select jsonb_build_object('summary',(select jsonb_build_object('views',count(*) filter(where event_type='page_view'),'sessions',count(distinct session_id) filter(where event_type='page_view'),'clicks',count(*) filter(where event_type='cta_click'),'starts',count(distinct session_id) filter(where event_type='form_start' and page='/daftar-kedai.html'),'completed',count(distinct session_id) filter(where event_type='submit_success' and page='/daftar-kedai.html'),'errors',count(*) filter(where event_type='submit_error'),'mobile',count(*) filter(where event_type='page_view' and device='mobile'),'leaves',count(*) filter(where event_type='form_leave' and page='/daftar-kedai.html')) from events),
'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day) from daily d),'[]'),
'sources',coalesce((select jsonb_agg(to_jsonb(s) order by views desc) from sources s),'[]'),
'pages',coalesce((select jsonb_agg(to_jsonb(p) order by views desc) from pages p),'[]'),
'steps',coalesce((select jsonb_agg(to_jsonb(s)) from steps s),'[]'),
'registrations',coalesce((select jsonb_agg(to_jsonb(r) order by day) from registrations r),'[]'),
'tracking_started_at',(select min(created_at) from site_activity_events));
$$;
revoke all on function public.merchant_admin_analytics(integer) from public,anon,authenticated;
grant execute on function public.merchant_admin_analytics(integer) to service_role;
