-- Allow Ask Relay chats created from the Telegram webhook.
alter table assistant_chats drop constraint if exists assistant_chats_surface_check;
alter table assistant_chats add constraint assistant_chats_surface_check
  check (surface in ('dashboard', 'docs', 'settings', 'extension', 'telegram'));