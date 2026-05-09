import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — Relay",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 py-16 lg:py-24">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-gray-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Last updated: May 9, 2026
        </p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              1. Who We Are
            </h2>
            <p>
              Relay (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is
              operated by Alimkhan Yergebayev, an individual based in
              Kazakhstan. This Privacy Policy explains how we collect, handle,
              store, and share your data when you use the Relay web application
              and Chrome extension (&quot;the Service&quot;).
            </p>
            <p className="mt-3">
              By using Relay, you agree to the collection and use of
              information in accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              2. Data Collection
            </h2>
            <div className="space-y-3">
              <p>
                To provide our cross-AI context synchronization features, we
                collect the following types of information:
              </p>
              <p>
                <strong className="text-gray-900">
                  Account &amp; Authentication Data:
                </strong>{" "}
                When you sign in with Google, we receive your name, email
                address, and profile picture via Google OAuth. We securely
                handle authentication tokens but do not store your Google
                password.
              </p>
              <p>
                <strong className="text-gray-900">Website Content:</strong>{" "}
                When the Relay Chrome extension is active, connected, and
                capture is explicitly enabled by you, we capture and store
                the{" "}
                <em>full text content</em> of your AI chat sessions on
                supported platforms (ChatGPT, Claude, Gemini, Grok, Codex,
                Perplexity, and DeepSeek). This includes your messages, the
                AI&apos;s responses, and associated HTML markup from the chat
                interface.
              </p>
              <p>
                <strong className="text-gray-900">Derived Data:</strong> Relay
                processes your captured chats to generate project summaries,
                decisions, open tasks, constraints, and session digests. These
                derived items are stored alongside your original chat content.
              </p>
              <p>
                <strong className="text-gray-900">Project Data:</strong>{" "}
                Project names, descriptions, objectives, and configurations
                you create within Relay.
              </p>
              <p>
                <strong className="text-gray-900">Extension Data:</strong>{" "}
                Relay Chrome extension 0.4.1 collects and stores only the
                extension data needed to connect your browser to your Relay
                account: device tokens, connection status, capture state, and
                extension preferences. This data is stored locally in your
                browser via Chrome storage APIs and, where needed, on Relay
                servers to authenticate the extension connection.
              </p>
              <p>
                <strong className="text-gray-900">
                  Browser Page Data Accessed by the Extension:
                </strong>{" "}
                The extension can read the URL, title, visible page text, and
                relevant chat interface markup on supported AI chat websites
                only when capture is enabled. We do not collect browsing
                history, bookmarks, keystrokes, passwords, payment information,
                or content from unsupported websites.
              </p>
              <p>
                <strong className="text-gray-900">
                  Usage &amp; Analytics Data:
                </strong>{" "}
                We collect privacy-respecting analytics to understand how you
                interact with the Service and to improve it. This includes:
                page views and navigation paths; feature usage events (e.g.,
                project creation, extension connection, MCP tool calls, digest
                generation); session and activation milestones; error events and
                exception traces; browser type, OS, and approximate geographic
                region (country-level); and extension version. Analytics are
                collected via PostHog and are associated with a randomly
                generated anonymous ID until you sign in, at which point they
                are linked to your user account. Analytics tracking is enabled
                by default across the web dashboard, browser extension, and MCP
                server. To opt out or request deletion of your analytics data,
                contact{" "}
                <a
                  href="mailto:support@onrelay.app"
                  className="underline hover:text-gray-700"
                >
                  support@onrelay.app
                </a>
                .
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              3. Data Handling
            </h2>
            <div className="space-y-3">
              <p>
                We use the data we collect exclusively for the core
                functionality of the Relay service:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Maintaining project canon (stable truth) and context packets
                  from your chat history and MCP interactions
                </li>
                <li>
                  Generating tentative updates that may be promoted to canon
                  after review or automatic confidence checks — you can lock any
                  canon entry to prevent automatic changes
                </li>
                <li>
                  Enabling context insertion into new AI chat sessions
                </li>
                <li>
                  Displaying your project dashboard, activity feed, and saved
                  context
                </li>
                <li>
                  Demoting or archiving raw memory items once they are covered
                  by canon or summary snapshots — demoted items are retained for
                  provenance and historical queries, not deleted
                </li>
                <li>
                  Authenticating your identity and managing your session
                </li>
                <li>
                  Improving service reliability and diagnosing failures
                </li>
              </ul>
              <p>
                Relay handles captured chat content as user-controlled project
                memory. The extension sends captured content to Relay over
                HTTPS only after you enable capture for a supported AI chat
                session. Relay processes that content to extract summaries,
                decisions, tasks, and constraints for your projects, and then
                displays or returns that context to you through the dashboard,
                extension, and MCP tools.
              </p>
              <p>
                We do <strong className="text-gray-900">not</strong> sell,
                rent, or share your data with third parties for advertising or
                marketing purposes.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              4. Data Storage &amp; Security
            </h2>
            <div className="space-y-3">
              <p>
                We take data protection seriously and implement robust
                measures to secure your information:
              </p>
              <p>
                <strong className="text-gray-900">Storage Location:</strong>{" "}
                Your data is stored in a Neon PostgreSQL database with
                encryption at rest and in transit, hosted in a secure cloud
                environment.
              </p>
              <p>
                <strong className="text-gray-900">Local Storage:</strong>{" "}
                Certain data, such as your immediate extension state and local
                preferences, is stored locally on your device within
                Chrome&apos;s storage mechanisms.
              </p>
              <p>
                <strong className="text-gray-900">
                  Extension Content Storage:
                </strong>{" "}
                Captured chat transcripts and derived project memory are stored
                in Relay&apos;s server-side database so they can sync across
                your Relay account. The extension does not store captured chat
                transcripts permanently in Chrome storage.
              </p>
              <p>
                <strong className="text-gray-900">Encryption:</strong> All
                data transmitted between your browser and our servers is
                encrypted using industry-standard protocols (HTTPS/TLS). We
                use secure session management via httpOnly cookies and scoped
                device tokens for extension authentication.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              5. Data Sharing
            </h2>
            <div className="space-y-3">
              <p>
                We do{" "}
                <strong className="text-gray-900">not sell</strong> your
                personal data or chat content to third parties. We only share
                data with trusted third-party service providers under strict
                confidentiality to operate the Service:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="text-gray-900">
                    Infrastructure Providers:
                  </strong>{" "}
                  We share necessary data with our hosting and database
                  providers (Neon, Vercel) solely to run the application
                  securely.
                </li>
                <li>
                  <strong className="text-gray-900">
                    Analytics Provider:
                  </strong>{" "}
                  We use PostHog (posthog.com) for privacy-respecting, aggregated
                  usage analytics and error tracking. Data sent to PostHog
                  includes usage events, error traces, browser/OS metadata, and
                  approximate location. Analytics data does not include captured
                  chat content or AI responses. PostHog processes this data on
                  our behalf under a data processing agreement; see
                  PostHog&apos;s privacy policy at posthog.com/privacy for
                  details.
                </li>
                <li>
                  <strong className="text-gray-900">
                    Authentication Provider:
                  </strong>{" "}
                  Google OAuth is used for sign-in. We do not control
                  Google&apos;s privacy practices.
                </li>
              </ul>
              <p>
                Captured chat content, project memory, and extension connection
                data are not shared with analytics providers and are not used
                for advertising, credit, lending, or resale.
              </p>
              <p>
                We are not responsible for the privacy practices of the AI
                tools you use (such as ChatGPT, Claude, Gemini, Grok, Codex,
                Perplexity, and DeepSeek). We recommend reviewing their
                respective privacy policies.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              6. Chrome Web Store Compliance
            </h2>
            <div className="space-y-3">
              <p>
                Relay&apos;s use and transfer to any other app of information
                received from Google APIs adheres to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-900 underline underline-offset-2"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  We do not use or transfer your data for serving
                  personalized, retargeted, or interest-based advertisements.
                </li>
                <li>
                  We do not use or transfer your data to determine
                  creditworthiness or for lending purposes.
                </li>
                <li>
                  We only use the data to provide or improve our
                  single-purpose features.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              7. Data Retention
            </h2>
            <p>
              Your data is retained only for as long as you maintain an active
              account. You may delete individual projects and their associated
              data at any time. If you disconnect an integration, the
              associated tokens and cached data are removed. When you delete
              your account via the Settings page, all associated data —
              including chat transcripts, project state, and derived content —
              is permanently removed from our systems.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              8. Your Rights
            </h2>
            <div className="space-y-3">
              <p>
                Depending on your location (e.g., under GDPR or CCPA), you
                have the right to:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="text-gray-900">Access:</strong> Request a
                  copy of the personal data we hold about you (also available
                  via the dashboard and project detail pages).
                </li>
                <li>
                  <strong className="text-gray-900">Delete:</strong> Delete
                  your data at any time (via Settings), or request complete
                  deletion by contacting us.
                </li>
                <li>
                  <strong className="text-gray-900">Revoke Access:</strong>{" "}
                  Disconnect the Chrome extension at any time, which stops
                  all data capture immediately.
                </li>
                <li>
                  <strong className="text-gray-900">Opt Out of Analytics:</strong>{" "}
                  Contact us to opt out of analytics tracking or to request
                  deletion of your analytics data held by PostHog.
                </li>
              </ul>
              <p>
                To exercise any of these rights, contact us at{" "}
                <a
                  href="mailto:support@onrelay.app"
                  className="text-gray-900 underline underline-offset-2"
                >
                  support@onrelay.app
                </a>
                . We will respond to your request within 30 days.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              9. Children&apos;s Privacy
            </h2>
            <p>
              The Service is not intended for use by individuals under 13
              years of age. We do not knowingly collect personal information
              from children. If we learn that we have collected data from a
              child under 13, we will take steps to delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              10. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Material
              changes will be communicated via email or a notice on the
              dashboard. Continued use of the Service after changes
              constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              11. Contact
            </h2>
            <p>
              For privacy-related questions or requests, contact us at{" "}
              <a
                href="mailto:support@onrelay.app"
                className="text-gray-900 underline underline-offset-2"
              >
                support@onrelay.app
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
