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
          Last updated: March 12, 2026
        </p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              1. Who We Are
            </h2>
            <p>
              Relay is operated by Alimkhan Yergebayev, an individual based in
              Kazakhstan. This privacy policy explains how we collect, use, and
              protect your information when you use the Relay web application
              and Chrome extension ("the Service").
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              2. Information We Collect
            </h2>
            <div className="space-y-3">
              <p>
                <strong className="text-gray-900">Account information:</strong>{" "}
                When you sign in with Google, we receive your name, email
                address, and profile picture from Google OAuth.
              </p>
              <p>
                <strong className="text-gray-900">Chat content:</strong> When
                the Relay Chrome extension is active and connected, we capture
                and store the <em>full text content</em> of your AI chat
                sessions. This includes your messages to AI tools (ChatGPT,
                Claude, Codex, Perplexity) and the AI's responses, including any
                raw HTML content from the chat interface.
              </p>
              <p>
                <strong className="text-gray-900">Derived data:</strong> Relay
                processes your captured chats to generate project summaries,
                decisions, open tasks, constraints, and session digests. These
                derived items are stored alongside your original chat content.
              </p>
              <p>
                <strong className="text-gray-900">Project data:</strong> Project
                names, descriptions, objectives, and configurations you create
                within Relay.
              </p>
              <p>
                <strong className="text-gray-900">Extension data:</strong>{" "}
                Device tokens, connection status, and extension preferences
                stored locally in your browser via Chrome storage APIs.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              3. How We Use Your Data
            </h2>
            <div className="space-y-3">
              <p>We use your data exclusively to provide the Relay service:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Generating and maintaining project briefs from your chat
                  history
                </li>
                <li>Enabling context insertion into new AI chat sessions</li>
                <li>
                  Displaying your project dashboard, activity feed, and saved
                  context
                </li>
                <li>Authenticating your identity and managing your session</li>
              </ul>
              <p>
                We do <strong className="text-gray-900">not</strong> sell, rent,
                or share your data with third parties for advertising or
                marketing purposes.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              4. Data Storage &amp; Security
            </h2>
            <p>
              Your data is stored in a Neon PostgreSQL database with encryption
              at rest and in transit. The database is hosted in a secure cloud
              environment. We use standard security practices including HTTPS
              for all communications, secure session management via httpOnly
              cookies, and scoped device tokens for extension authentication.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              5. Analytics
            </h2>
            <p>
              We may use PostHog or similar privacy-respecting analytics tools
              to understand how the Service is used. Analytics data is
              aggregated and does not include your chat content. You may opt out
              of analytics via your browser's Do Not Track setting.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              6. Data Retention
            </h2>
            <p>
              Your data is retained for as long as you maintain an active
              account. You may delete individual projects and their associated
              data at any time. When you delete your account via the Settings
              page, all associated data — including chat transcripts, project
              state, and derived content — is permanently removed from our
              systems.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              7. Your Rights
            </h2>
            <div className="space-y-3">
              <p>You have the right to:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Access all data we store about you (via the dashboard and
                  project detail pages)
                </li>
                <li>
                  Delete your data at any time (via Settings → Delete Account)
                </li>
                <li>Export your project data</li>
                <li>
                  Disconnect the Chrome extension at any time, which stops all
                  data capture
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              8. Third-Party Services
            </h2>
            <p>
              Relay integrates with Google OAuth for authentication. We do not
              control and are not responsible for the privacy practices of
              Google or the AI tools you use (ChatGPT, Claude, Codex,
              Perplexity). We recommend reviewing their respective privacy
              policies.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              9. Children's Privacy
            </h2>
            <p>
              The Service is not intended for use by individuals under 13 years
              of age. We do not knowingly collect personal information from
              children.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              10. Changes to This Policy
            </h2>
            <p>
              We may update this privacy policy from time to time. We will
              notify users of significant changes via email or a notice on the
              dashboard. Continued use of the Service after changes constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              11. Contact
            </h2>
            <p>
              For privacy-related questions or requests, contact us at{" "}
              <a
                href="mailto:alimkhan.ergebayev@gmail.com"
                className="text-gray-900 underline underline-offset-2"
              >
                alimkhan.ergebayev@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
