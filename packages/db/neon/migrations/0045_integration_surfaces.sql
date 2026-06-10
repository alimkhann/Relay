-- Memory Architecture v2 — integration platform surfaces.
-- Extends the platform_type enum with the integration surfaces we plan to
-- support (gmail, slack, github, linear, calendar, telegram, whatsapp).
-- No code consumes these values yet; this migration ships the enum values
-- so future adapters can write without another schema bump.
--
-- IMPORTANT: this file MUST contain only ALTER TYPE ... ADD VALUE statements.
-- New enum labels cannot be referenced in the same transaction that adds
-- them. Anything else (insert, lookup) must live in a separate migration.

alter type platform_type add value if not exists 'gmail';
alter type platform_type add value if not exists 'slack';
alter type platform_type add value if not exists 'github';
alter type platform_type add value if not exists 'linear';
alter type platform_type add value if not exists 'calendar';
alter type platform_type add value if not exists 'telegram';
alter type platform_type add value if not exists 'whatsapp';

-- DOWN
-- (Postgres cannot drop enum values once added. Leave forward-compatible.)
