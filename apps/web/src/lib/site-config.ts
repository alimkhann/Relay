export const APP_ORIGIN = "https://www.onrelay.app"
export const APP_API_ANCHOR = `${APP_ORIGIN}/api/`

export const DISCOVERY_LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</docs/api>; rel="service-doc"; type="text/html"',
].join(", ")
