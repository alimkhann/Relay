-- Add missing platform types for Gemini, Grok, and DeepSeek
alter type platform_type add value if not exists 'gemini';
alter type platform_type add value if not exists 'grok';
alter type platform_type add value if not exists 'deepseek';

-- Seed missing target profiles
insert into target_profiles (key, name, platform, description, config)
values
  ('gemini_exploration', 'Gemini Exploration', 'gemini', 'Exploration and research handoff for Gemini.', '{}'::jsonb),
  ('grok_conversation', 'Grok Conversation', 'grok', 'Conversational handoff for Grok.', '{}'::jsonb),
  ('deepseek_reasoning', 'DeepSeek Reasoning', 'deepseek', 'Reasoning and analysis handoff for DeepSeek.', '{}'::jsonb)
on conflict (key) do nothing;
