import { APP_API_ANCHOR, APP_ORIGIN } from "@/lib/site-config"

const BODY = {
  linkset: [
    {
      anchor: APP_API_ANCHOR,
      "service-desc": [
        {
          href: `${APP_ORIGIN}/openapi.json`,
          type: "application/openapi+json",
        },
      ],
      "service-doc": [
        {
          href: `${APP_ORIGIN}/docs/api`,
          type: "text/html",
        },
      ],
      status: [
        {
          href: `${APP_ORIGIN}/api/health`,
          type: "application/json",
        },
      ],
    },
  ],
}

export async function GET() {
  return Response.json(BODY, {
    headers: {
      "Content-Type": "application/linkset+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=300",
    },
  })
}
