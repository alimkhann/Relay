import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Nav } from "../../components/nav"
import { Footer } from "../../components/footer"
import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { readSessionUserFromCookie } from "@/lib/auth/session-cookie"
import { BlogHeroArt } from "../blog-hero-art"
import { BLOG_POSTS, getBlogPost } from "../posts"

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return {}
  return {
    title: `${post.title} — Relay blog`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
    },
  }
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()
  const sessionUser = await readSessionUserFromCookie()

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      <PageTelemetry
        surface="web-landing"
        area="marketing"
        pageName={`blog_${post.slug}`}
        pageGroup="blog"
        message="Rendered a blog post."
        context={{ source: post.slug }}
      />
      <Nav isLoggedIn={sessionUser !== null} />
      <article className="mx-auto max-w-2xl px-5 pb-24 pt-32">
        <Link href="/blog" className="text-xs text-white/35 transition-colors hover:text-white/60">
          ← All posts
        </Link>
        <BlogHeroArt slug={post.slug} className="mt-6" />
        <div className="mt-6 flex items-center gap-2 text-xs text-white/30">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span>·</span>
          <span>{post.readingMinutes} min read</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {post.title}
        </h1>
        <div className="mt-2">{post.content}</div>

        <div className="mt-14 rounded-2xl border border-white/[0.07] bg-[#111] p-6 text-center">
          <p className="text-sm font-semibold text-white">Give your AI tools memory</p>
          <p className="mt-1 text-xs text-white/45">
            Relay is free to start. Browser extension + MCP for your coding agents.
          </p>
          <Link
            href="/get-started"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90"
          >
            Get started free →
          </Link>
        </div>
      </article>
      <Footer />
    </main>
  )
}
