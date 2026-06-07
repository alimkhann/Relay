function createOAuthNonce() {
  return crypto.randomUUID();
}

export async function requestGoogleIdentityTokens(input: {
  interactive: boolean;
  prompt: "none" | "select_account";
}) {
  const googleClientId = process.env.PLASMO_PUBLIC_CRX_GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error("Google sign-in is not configured (missing client ID).");
  }

  const redirectUrl = chrome.identity.getRedirectURL();
  const state = createOAuthNonce();
  const nonce = createOAuthNonce();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUrl);
  authUrl.searchParams.set("response_type", "token id_token");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("prompt", input.prompt);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("state", state);

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: input.interactive,
    });

  if (!callbackUrl) {
    throw new Error("Google sign-in was cancelled.");
  }

  const hashParams = new URLSearchParams(new URL(callbackUrl).hash.slice(1));
  const callbackState = hashParams.get("state");
  if (callbackState !== state) {
    throw new Error("Google sign-in returned an invalid state.");
  }

  const accessToken = hashParams.get("access_token");
  const idToken = hashParams.get("id_token");
  if (!accessToken || !idToken) {
    throw new Error("Google sign-in did not return the required tokens.");
  }

  return {
    accessToken,
    idToken,
  };
}
