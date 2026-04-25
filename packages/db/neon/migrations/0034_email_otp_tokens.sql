CREATE TABLE IF NOT EXISTS email_otp_tokens (
  email TEXT PRIMARY KEY,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
