import type { ReactNode } from "react"

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  readingMinutes: number
  content: ReactNode
}

const P = ({ children }: { children: ReactNode }) => (
  <p className="mt-5 text-[15px] leading-relaxed text-white/60">{children}</p>
)
const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mt-10 text-xl font-semibold tracking-tight text-white">{children}</h2>
)
const LI = ({ children }: { children: ReactNode }) => (
  <li className="mt-2 text-[15px] leading-relaxed text-white/60">{children}</li>
)
const UL = ({ children }: { children: ReactNode }) => (
  <ul className="mt-4 list-disc pl-5 marker:text-white/25">{children}</ul>
)
const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[13px] text-white/80">{children}</code>
)

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-your-ai-tools-forget-everything",
    title: "Why your AI tools forget everything (and what that actually costs you)",
    description:
      "Every new chat starts from zero. Here's why context loss is the biggest hidden tax on working with AI, and how a memory layer fixes it.",
    date: "2026-06-11",
    readingMinutes: 4,
    content: (
      <>
        <P>
          Here&apos;s a thing nobody talks about: if you use AI seriously, you spend a stupid amount of
          time repeating yourself. You open a new ChatGPT chat and re-explain your project. You switch
          to Claude and re-explain it again. You fire up Claude Code and paste the same context for the
          third time today.
        </P>
        <P>
          Each chat is an island. The model you talked to yesterday remembers nothing. The decisions
          you made in one thread don&apos;t exist in the next one. And the moment a conversation gets
          long enough to be useful, it gets compacted or you hit the context limit and start over.
        </P>
        <H2>What this actually costs</H2>
        <P>
          It&apos;s not just the five minutes of re-explaining. The real cost is worse:
        </P>
        <UL>
          <LI>
            You make the same decision twice. You already chose your stack, your schema, your naming
            in an old chat. The new chat doesn&apos;t know, so it argues with you or suggests something
            you already rejected.
          </LI>
          <LI>
            Your AI gives worse answers. Without context it falls back to generic advice. The quality
            difference between &quot;AI that knows your project&quot; and &quot;AI that doesn&apos;t&quot; is massive.
          </LI>
          <LI>
            You avoid switching tools. Claude is better at some things, ChatGPT at others. But
            switching means re-explaining, so you stay where your context is, even when it&apos;s the
            wrong tool for the task.
          </LI>
        </UL>
        <H2>Chat memory features don&apos;t fix this</H2>
        <P>
          ChatGPT has memory. Claude has projects. But they&apos;re silos: ChatGPT&apos;s memory doesn&apos;t help
          you in Claude, and neither helps you in Cursor or Claude Code. The memory belongs to the
          tool, not to you.
        </P>
        <P>
          That&apos;s backwards. Your context, your decisions, your constraints, your tasks, that&apos;s
          YOUR data. It should follow you to whatever model or agent you point at the problem.
        </P>
        <H2>The fix: a memory layer that sits above the tools</H2>
        <P>
          This is the whole idea behind Relay. It quietly captures what matters from your AI chats
          (decisions, tasks, constraints, not raw transcripts), keeps a living project brief, and
          hands that context to whatever you use next. Browser extension for chat sites, MCP for
          coding agents like Claude Code and Cursor.
        </P>
        <P>
          New chat? One click inserts your brief and the model is instantly up to speed. Switch from
          ChatGPT to Claude mid-project? Same memory, zero re-explaining. Your coding agent can read
          and write the same context your chats build up.
        </P>
        <P>
          You stop being the human clipboard between your own tools. That&apos;s it. That&apos;s the product.
        </P>
      </>
    ),
  },
  {
    slug: "how-i-use-relay-with-claude-code",
    title: "How I use Relay with Claude Code every day",
    description:
      "My actual daily workflow: MCP setup in one command, briefs at session start, auto-saved decisions, and continuity across compactions.",
    date: "2026-06-11",
    readingMinutes: 5,
    content: (
      <>
        <P>
          I build Relay with Claude Code, and Relay itself is the memory layer for that work. Very
          meta, but it means I feel every rough edge myself. Here&apos;s the actual workflow, not the
          marketing version.
        </P>
        <H2>Setup is one command</H2>
        <P>
          <Code>npx @onrelay/wizard</Code> detects your coding agents (Claude Code, Cursor, Codex,
          Windsurf and others), installs the MCP server, and signs you in. Takes about a minute.
          After that your agent has six Relay tools: get the brief, recall context, search sources,
          save memory, list projects, switch projects.
        </P>
        <H2>Session start: get_brief</H2>
        <P>
          Every session starts with the agent calling <Code>get_brief</Code>. It gets back the
          project objective, active constraints, open tasks, and what happened in recent sessions.
          No &quot;let me explore the codebase for 10 minutes to figure out what we&apos;re doing&quot; — it
          already knows the decisions behind the code, which a codebase scan can&apos;t tell you.
        </P>
        <H2>During work: it saves what matters</H2>
        <P>
          When we decide something durable (&quot;personal memory is a project with kind=personal&quot;,
          &quot;cron maxDuration caps at 60 on hobby plan&quot;), the agent saves it as a decision or
          constraint. When something blocks us, it becomes a task. I don&apos;t think about this, it
          just happens as part of the work.
        </P>
        <H2>The killer feature: surviving compaction</H2>
        <P>
          Long sessions get compacted and agents forget the middle of the conversation. Relay hooks
          into Claude Code&apos;s lifecycle (PreCompact, SessionEnd) and checkpoints context before
          it&apos;s lost. Next session picks up exactly where the last one ended, even across machines.
        </P>
        <H2>And it&apos;s the same memory my chats use</H2>
        <P>
          This is the part that compounds: when I brainstorm a feature in ChatGPT on my phone, the
          extension captures the decisions. When I sit down at my desk, Claude Code already has
          them via MCP. One memory, every tool.
        </P>
        <P>
          If you work with a coding agent daily, try this loop for a week. The difference shows up
          on day two, when your agent opens with &quot;continuing from yesterday: we decided X, next
          step is Y&quot; instead of asking what the project is about.
        </P>
      </>
    ),
  },
  {
    slug: "7-relay-features-you-probably-missed",
    title: "7 Relay features you probably missed",
    description:
      "Sources, one-click capture, personal memory, the Relay agent, hygiene commands — the stuff beyond the obvious capture-and-brief loop.",
    date: "2026-06-11",
    readingMinutes: 4,
    content: (
      <>
        <P>
          Most people install Relay, see the capture chip and the brief, and stop exploring. Fair.
          But there&apos;s more in there, and some of it is the best part of the product. Quick tour:
        </P>
        <H2>1. Sources: give your projects real documents</H2>
        <P>
          You can attach docs, PDFs, repos, websites, even package docs to a project. Relay indexes
          them and your AI tools can search and read them through MCP or the Relay agent. Your agent
          citing your actual spec instead of hallucinating one is a different experience.
        </P>
        <H2>2. One-click capture of any selection</H2>
        <P>
          Select text anywhere in a chat, save it to a project. For when auto-capture is off or
          you&apos;re on a page Relay doesn&apos;t watch.
        </P>
        <H2>3. Personal memory</H2>
        <P>
          Not everything is a project. Relay keeps a personal space for durable facts about you:
          preferences, goals, commitments, the stuff you keep re-telling every AI. It&apos;s
          auto-categorized (people, companies, events, notes) and any of your tools can recall it.
        </P>
        <H2>4. the Relay agent</H2>
        <P>
          There&apos;s a chat in the dashboard and the extension that can act on your memory: search it,
          save to it, clean it up, summarize a project, even search the web on paid plans. &quot;What
          did we decide about X?&quot; is the query I use most.
        </P>
        <H2>5. Memory hygiene commands</H2>
        <P>
          In the agent chat you can type <Code>/archive</Code>, <Code>/forget</Code>, <Code>/reaffirm</Code>{" "}
          on any memory item. Memory that only grows becomes garbage; pruning is a feature.
        </P>
        <H2>6. Project switching from the chip</H2>
        <P>
          The inline chip on chat sites has a project switcher. Capture this chat into a different
          project without opening the dashboard. Your manual pick sticks for that conversation.
        </P>
        <H2>7. Brief insert keyboard shortcut</H2>
        <P>
          <Code>⌘⇧I</Code> (or <Code>Ctrl+Shift+I</Code>) inserts your project brief into the chat
          you&apos;re looking at. Fastest way to make a fresh model instantly useful.
        </P>
        <P>
          If you set up only one thing from this list, make it sources. Context from real documents
          is the biggest answer-quality jump you can buy for five minutes of setup.
        </P>
      </>
    ),
  },
  {
    slug: "project-memory-vs-personal-memory",
    title: "Project memory vs personal memory: how Relay decides what goes where",
    description:
      "Two kinds of memory, two very different jobs. How routing works, why personal never pollutes your projects, and how to steer it.",
    date: "2026-06-11",
    readingMinutes: 4,
    content: (
      <>
        <P>
          Relay keeps two kinds of memory and they behave differently on purpose. Mixing them up is
          how memory products become junk drawers, so the separation is strict.
        </P>
        <H2>Project memory: decisions with receipts</H2>
        <P>
          A project holds the durable truth of one piece of work: the objective, decisions (with
          why), constraints, open tasks, shipped artifacts. It&apos;s built from your captured chats and
          agent sessions, and it&apos;s what the brief is generated from. When a decision gets
          superseded, the old one is archived, not silently overwritten — you can always trace why
          something is the way it is.
        </P>
        <H2>Personal memory: facts about you</H2>
        <P>
          Personal memory holds things that outlive any project: you prefer TypeScript, you&apos;re
          based in Almaty, you&apos;re launching in March, your friend&apos;s startup does logistics. It&apos;s
          auto-categorized folk-style (person, company, event, note) and follows you across every
          tool.
        </P>
        <H2>How routing decides</H2>
        <P>
          When Relay captures a chat, it scores which project the conversation belongs to: name
          mentions, overlap with the project&apos;s description and saved context, previous
          associations for that conversation. A few rules keep it honest:
        </P>
        <UL>
          <LI>Your manual pick always wins. If you set a project for a chat, Relay won&apos;t second-guess it.</LI>
          <LI>
            A project name being mentioned is not enough to silently reroute a save. If Relay isn&apos;t
            sure, it asks instead of guessing.
          </LI>
          <LI>
            Personal is never auto-selected as a dumping ground. Full chats only go there when you
            deliberately park a conversation on personal.
          </LI>
          <LI>
            &quot;What do you know about me&quot; style chats route to personal, even if your project gets
            name-dropped in them.
          </LI>
        </UL>
        <H2>Steering it</H2>
        <P>
          Give your projects a real description, that&apos;s what the router matches against. Use the
          chip&apos;s project switcher when you start a chat that belongs somewhere unusual. And prune:
          <Code>/forget</Code> anything that shouldn&apos;t have been saved. Memory you trust is memory
          you actually use.
        </P>
      </>
    ),
  },
  {
    slug: "relay-beyond-ai-chats",
    title: "What's next: Relay beyond AI chats",
    description:
      "Telegram, Gmail, Calendar, GitHub, and messaging apps. Agentic integrations, extension capture, and why personal memory gets 10x more useful.",
    date: "2026-06-11",
    readingMinutes: 4,
    content: (
      <>
        <P>
          Today Relay&apos;s memory is built from AI chats, coding agents, and the documents you attach.
          That&apos;s a solid start, but let&apos;s be honest: most of your real context doesn&apos;t live in AI
          chats. It lives in Telegram threads, email, your calendar, and your repos.
        </P>
        <P>So that&apos;s what we&apos;re building next, in this order:</P>
        <H2>Telegram first</H2>
        <P>
          A Relay bot you just... talk to. No menus, no buttons. Pair it with your account once,
          then it&apos;s the full Relay agent in your pocket: ask what you promised this week, save a
          thought as memory, forward a message and it becomes a candidate fact. Telegram isn&apos;t a
          read-only pipe. The bot is Relay itself, running as an agent.
        </P>
        <H2>Then Calendar, Gmail, and the rest</H2>
        <P>
          These won&apos;t be read-only either. Relay will draft and send emails (with your approval),
          create calendar events, set reminders, and act on what your memory already knows. Early
          versions will lean on the web apps for Gmail and Calendar, so the UX won&apos;t be perfect
          yet. You&apos;ll be in browser tabs, not native apps.
        </P>
        <P>
          Extension support is coming for those sites, the same way Relay already reads your AI
          chats today. WhatsApp, Telegram web, Discord, and more: the extension will read
          conversations on those pages (everything encrypted) and save what matters into the right
          project, including personal. Same capture model, just applied to where your real
          conversations happen.
        </P>
        <H2>Then GitHub</H2>
        <P>
          Issues, PRs, and review threads are where project decisions actually get made. A GitHub
          app will feed those into project memory so &quot;why did we do it this way&quot; has an answer
          even when the discussion happened in a PR comment at 2am.
        </P>
        <H2>Coming soon</H2>
        <P>
          Telegram, WhatsApp, Discord, Gmail, Calendar, Notion, Linear, Jira, Slack, and GitHub
          are all on the roadmap. You can see the full list on the{" "}
          <a href="/" className="text-white/80 underline decoration-white/20 underline-offset-2 hover:text-white">
            landing page
          </a>{" "}
          under &quot;Coming soon.&quot;
        </P>
        <H2>The principle behind all of it</H2>
        <P>
          Every integration follows the same rules: you explicitly connect it, you see exactly what
          Relay can read and do, extracted facts land in a review queue before they become memory,
          and you can pause or delete everything. &quot;Silent&quot; means no manual work, never hidden
          capture.
        </P>
        <P>
          This post is an early sketch. We&apos;ll keep updating it as the integrations ship. If you
          want early access to the Telegram bot, sign up and you&apos;ll see it in the dashboard the
          day it&apos;s live.
        </P>
      </>
    ),
  },
]

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null
}