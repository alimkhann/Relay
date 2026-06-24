const GOOGLE_LOGOUT_URL = "https://accounts.google.com/Logout"
const GOOGLE_LOGOUT_RETURN_URL = "https://www.google.com/"

export function getGoogleLogoutUrl() {
  const logoutUrl = new URL(GOOGLE_LOGOUT_URL)
  logoutUrl.searchParams.set("continue", GOOGLE_LOGOUT_RETURN_URL)
  return logoutUrl
}
