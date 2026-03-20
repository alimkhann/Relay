-- Allow token lookup by hash without requiring user context.
-- resolveViewer() needs to look up tokens before knowing who the user is,
-- so these SELECT policies allow reading when relay.current_user_id is not set.

CREATE POLICY "Allow token lookup by hash" ON extension_api_tokens FOR SELECT
  USING (current_relay_user_id() IS NULL OR user_id = current_relay_user_id());

CREATE POLICY "Allow token lookup by hash" ON mcp_tokens FOR SELECT
  USING (current_relay_user_id() IS NULL OR user_id = current_relay_user_id());
