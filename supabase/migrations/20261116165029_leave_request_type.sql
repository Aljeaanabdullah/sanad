-- Sanad (PRD 1.9, 7.1): leave requests from the phone. The enum value must be committed
-- before any function uses it, so it gets its own migration.
alter type public.request_type add value if not exists 'leave';
