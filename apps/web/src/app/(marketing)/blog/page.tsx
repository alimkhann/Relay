import type { Metadata } from "next"
import Link from "next/link"

import { Nav } from "../components/nav"
import { Footer } from "../components/footer"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { readSessionUserFromCookie } from "@/lib/auth/session-cookie"
import { BlogHeroArt } from "./blog-hero-art"
import { BLOG_POSTS } from "./posts"

export const metadata: Metadata = {
  title: "Blog — Relay",
  description:
    "Notes on AI memory, context engineering, and building Relay: use cases, workflows, and what's coming next.",
  alternates: { canonical: "/blog" },
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export default async function BlogIndexPage() {
  const sessionUser = await readSessionUserFromCookie()

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <PageTelemetry
        surface="web-landing"
        area="marketing"
        pageName="blog"
        pageGroup="blog"
        message="Rendered the blog index."
      />
      <Nav isLoggedIn={sessionUser !== null} />
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-32">
        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Blog</h1>
        <p className="mt-3 text-sm text-white/45">
          Notes on AI memory, context engineering, and building Relay.
        </p>

        <div className="mt-12 space-y-10">
          {BLOG_POSTS.map((post) => (
            <article key={post.slug}>
              <Link href={`/blog/${post.slug}`} className="group block">
                <BlogHeroArt slug={post.slug} className="mb-4 transition-opacity group-hover:opacity-90" />
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  <span>·</span>
                  <span>{post.readingMinutes} min read</span>
                </div>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-white transition-colors group-hover:text-white/80">
                  {post.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{post.description}</p>
              </Link>
            </article>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  )
}
