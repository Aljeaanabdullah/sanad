-- Sanad S3 — punch hardening (PRD 4.7, owner decision 2026-11-16).
-- A device-biometric punch must be signed by a key that lives in the bound phone's secure hardware and
-- only works after Face ID / fingerprint. The server keeps the public half, hands out one-time nonces,
-- and the punch function checks the signature. Rollout: signatures are checked and recorded first;
-- the owner turns on `require_device_signature` later.

-- ---------------------------------------------------------------------------
-- 1. Devices: the key, and the internal device id hidden from clients
-- ---------------------------------------------------------------------------
alter table public.devices
  add column public_key text,                 -- SubjectPublicKeyInfo (DER, base64), ECDSA P-256
  add column key_attested boolean not null default false,
  add column key_attestation jsonb,           -- summary of the Android Key Attestation (no secrets)
  add column key_registered_at timestamptz;

-- Clients could read `device_identifier` of their own row and replay it from a computer. From now on
-- they read only these columns (RLS still limits rows: own row, or admin).
revoke select on public.devices from anon, authenticated;
grant select (id, employee_id, platform, model, bound_at, key_attested, key_attestation, key_registered_at)
  on public.devices to authenticated;

-- The punch log kept a copy of the device id in the phone report (readable by the employee and staff).
update public.attendance_punches
  set client_report = client_report - 'device_identifier'
  where client_report ? 'device_identifier';

-- ---------------------------------------------------------------------------
-- 2. One-time nonces (key registration and punches)
-- ---------------------------------------------------------------------------
create table public.device_challenges (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  purpose text not null check (purpose in ('bind_key', 'punch')),
  nonce text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index device_challenges_employee_created_idx on public.device_challenges (employee_id, created_at desc);

-- RLS on, no policies: no client role (employee, supervisor, HR, admin) can read or write nonces.
alter table public.device_challenges enable row level security;
revoke all on public.device_challenges from anon, authenticated;

-- How long a nonce stays valid.
create function private.challenge_ttl(p_purpose text) returns interval
language sql immutable set search_path = '' as $$
  select case p_purpose when 'punch' then interval '60 seconds' else interval '5 minutes' end
$$;

-- The phone asks for a nonce right before it signs.
create function public.device_challenge(p_purpose text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_employee uuid := private.current_employee_id();
  v_nonce text;
begin
  if v_employee is null then
    raise exception 'not_an_active_employee' using errcode = '42501';
  end if;
  if p_purpose is null or p_purpose not in ('bind_key', 'punch') then
    raise exception 'invalid_purpose' using errcode = '22023';
  end if;
  -- Keep the table small: old nonces of this employee go.
  delete from public.device_challenges
    where employee_id = v_employee and created_at < now() - interval '1 day';
  if (select count(*) from public.device_challenges
      where employee_id = v_employee and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  v_nonce := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.device_challenges (employee_id, purpose, nonce, expires_at)
    values (v_employee, p_purpose, v_nonce, now() + private.challenge_ttl(p_purpose));
  return v_nonce;
end;
$$;

revoke all on function public.device_challenge(text) from public, anon;
grant execute on function public.device_challenge(text) to authenticated;

-- Server functions only: marks the nonce used. 'ok' | 'expired' | 'unknown' (wrong, used, or someone else's).
create function public.consume_device_challenge(p_employee uuid, p_purpose text, p_nonce text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz;
begin
  update public.device_challenges
    set used_at = now()
    where employee_id = p_employee and purpose = p_purpose and nonce = p_nonce and used_at is null
    returning expires_at into v_expires;
  if not found then
    return 'unknown';
  end if;
  return case when v_expires < now() then 'expired' else 'ok' end;
end;
$$;

revoke all on function public.consume_device_challenge(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_device_challenge(uuid, text, text) to service_role;

-- The app asks after sign-in whether its phone still has to register a key.
--   'no_device'  not bound yet     'none'  bound, no key
--   'attested'   key with Android Key Attestation     'unattested'  key without (iPhone for now)
create function public.device_key_state()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
       when d.public_key is null then 'none'
       when d.key_attested then 'attested'
       else 'unattested'
     end
     from public.devices d where d.employee_id = private.current_employee_id()),
    'no_device')
$$;

revoke all on function public.device_key_state() from public, anon;
grant execute on function public.device_key_state() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Switches the owner (system admin) controls
-- ---------------------------------------------------------------------------
create table public.punch_security_settings (
  id boolean primary key default true check (id),
  -- Off during the rollout week: signatures are checked and recorded, nobody is refused for them.
  require_device_signature boolean not null default false,
  -- The old face-descriptor path (PRD 4.1–4.5). The new app does not use it.
  allow_face_descriptor boolean not null default true,
  -- iPhone keys have no attestation until App Attest is added.
  allow_unattested_ios boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.punch_security_settings (id) values (true);

create trigger set_updated_at before update on public.punch_security_settings
  for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.punch_security_settings
  for each row execute function private.audit_row_change();

alter table public.punch_security_settings enable row level security;
revoke all on public.punch_security_settings from anon;

-- Admin reads and changes the switches; employee, supervisor and HR see nothing.
create policy "admin reads" on public.punch_security_settings
  for select to authenticated
  using ((select private.has_role(array['admin']::public.app_role[])));

create policy "admin updates" on public.punch_security_settings
  for update to authenticated
  using ((select private.has_role(array['admin']::public.app_role[])))
  with check ((select private.has_role(array['admin']::public.app_role[])));

revoke insert, delete, truncate on public.punch_security_settings from authenticated;
