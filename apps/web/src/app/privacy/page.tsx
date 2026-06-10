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
          Last updated: June 7, 2026
        </p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Single Purpose
            </h2>
            <p>
              Relay&apos;s single purpose is to sync your project context
              across the AI chats and coding agents you already use. Every
              permission, host access, and piece of data Relay collects exists
              to serve that purpose. We do not sell, broker, rent, or use your
              data for advertising, profiling, or training third-party models.
            </p>
            <p className="mt-3">
              The Relay Chrome extension does not load or execute remote code.
              All extension JavaScript is bundled at build time and shipped
              through the Chrome Web Store; updates ship the same way.
            </p>
          </section>

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
                interface. Relay uses this website content only to provide the
                product&apos;s project-memory and context-sync features.
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
                Relay Chrome extension 0.5.1 collects and stores only the
                extension data needed to connect your browser to your Relay
                account: device tokens, connection status, capture state, and
                extension preferences. This data is stored locally in your
                browser via Chrome storage APIs and, where needed, on Relay
                servers to authenticate the extension connection.
              </p>
              <p>
                <strong className="text-gray-900">
                  Ask Relay Messages and Files:
                </strong>{" "}
                When you use Ask Relay, we collect the messages, instructions,
                and files you choose to submit so Relay can answer your
                request. Uploaded files and source documents may include their
                file name, type, content, and extracted text.
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
              <p>
                <strong className="text-gray-900">
                  Chrome Extension Permissions:
                </strong>{" "}
                The Relay Chrome extension requests only the permissions it
                needs, each tied directly to the single purpose of syncing your
                project context across AI chats. We prominently disclose this
                data collection here and in the Chrome Web Store listing, and
                capture only begins after you explicitly enable it:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="text-gray-900">storage:</strong> stores
                  your device connection token, connection status, capture
                  on/off state, and extension preferences locally in your
                  browser. No chat content is kept in extension storage.
                </li>
                <li>
                  <strong className="text-gray-900">tabs:</strong> identifies
                  which supported AI chat tab is active so capture targets the
                  correct conversation.
                </li>
                <li>
                  <strong className="text-gray-900">activeTab:</strong> reads
                  the current tab&apos;s URL, title, and visible chat content —
                  only on supported AI chat sites and only when you have enabled
                  capture.
                </li>
                <li>
                  <strong className="text-gray-900">sidePanel:</strong> renders
                  the Relay side panel interface.
                </li>
                <li>
                  <strong className="text-gray-900">identity:</strong> signs you
                  in and links the extension to your Relay account via Google
                  OAuth.
                </li>
                <li>
                  <strong className="text-gray-900">scripting:</strong> injects
                  the content script that extracts chat turns on supported AI
                  chat sites.
                </li>
                <li>
                  <strong className="text-gray-900">contextMenus:</strong>{" "}
                  provides the right-click &quot;Save to Relay&quot; action for
                  text you select.
                </li>
                <li>
                  <strong className="text-gray-900">audioCapture (optional):</strong>{" "}
                  enables the voice-input button in the Relay side panel so
                  you can dictate notes or chat messages instead of typing.
                  Microphone access is requested only when you tap the mic
                  button, transcribed locally / via your AI provider, and never
                  stored as audio. The permission is optional — declining it
                  disables the mic button and nothing else.
                </li>
                <li>
                  <strong className="text-gray-900">
                    optional audioCapture:
                  </strong>{" "}
                  accesses microphone audio only after you choose voice input
                  in Ask Relay. Relay does not store or send raw microphone
                  audio to Relay servers. Chrome&apos;s browser-provided speech
                  recognition may process the audio to return dictated text.
                </li>
                <li>
                  <strong className="text-gray-900">
                    Host access to AI chat sites
                  </strong>{" "}
                  (ChatGPT, Claude, Gemini, Grok, Codex, Perplexity, DeepSeek):
                  reads conversation content on those sites only while capture
                  is enabled. Host access to onrelay.app domains is used solely
                  to communicate with the Relay backend, and the analytics host
                  is used only to send privacy-respecting usage events (never
                  chat content).
                </li>
              </ul>
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
                <li>
                  Answering Ask Relay messages and processing files or source
                  documents you explicitly submit
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
                Relay does not allow humans to read your captured chat content
                or derived project memory except when you explicitly ask us to
                review specific data for support, when access is necessary for
                security or abuse investigation, when access is required to
                comply with applicable law, or when the data has been
                aggregated or anonymized for internal operations.
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
              4. Data Storage
            </h2>
            <div className="space-y-3">
              <p>
                We take data protection seriously and implement robust
                measures to secure your information:
              </p>
              <p>
                <strong className="text-gray-900">Storage Location:</strong>{" "}
                Account, project, captured chat, derived memory, and billing
                records are stored in a Neon PostgreSQL database with
                encryption at rest and in transit. Uploaded source documents
                and Ask Relay attachments are stored as encrypted objects in
                Cloudflare R2 or another S3-compatible object-storage service.
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
                personal data or chat content to third parties. We share data
                only as needed to provide Relay, comply with law, or protect
                the Service. The parties that may receive user data are:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <strong className="text-gray-900">Vercel:</strong> hosts
                  Relay&apos;s web application and API and therefore processes
                  requests, account identifiers, submitted content, IP
                  addresses, and operational logs needed to deliver and secure
                  the Service.
                </li>
                <li>
                  <strong className="text-gray-900">
                    Neon and Neon Auth:
                  </strong>{" "}
                  store Relay account, authentication, project, captured chat,
                  derived memory, extension-token, and billing records.
                </li>
                <li>
                  <strong className="text-gray-900">
                    Google Gemini API / Google AI:
                  </strong>{" "}
                  receives the portions of captured chat content, project
                  context, Ask Relay messages, submitted files or extracted
                  text, and instructions needed to generate answers,
                  summaries, embeddings, classifications, and other
                  user-requested Relay features. When you choose voice input,
                  Chrome&apos;s browser-provided speech-recognition service may
                  also send microphone audio to Google to return dictated text;
                  Relay does not store the raw audio.
                </li>
                <li>
                  <strong className="text-gray-900">
                    Cloudflare R2 or configured S3-compatible object storage:
                  </strong>{" "}
                  stores encrypted source documents and Ask Relay attachments
                  that you upload.
                </li>
                <li>
                  <strong className="text-gray-900">PostHog:</strong> receives
                  product-usage events, error traces, account or anonymous
                  analytics identifiers, browser and operating-system
                  metadata, approximate country-level location, and extension
                  version for analytics and error tracking. PostHog does not
                  receive captured chat content, Ask Relay messages, uploaded
                  files, or AI responses.
                </li>
                <li>
                  <strong className="text-gray-900">Google OAuth:</strong>{" "}
                  processes sign-in requests and provides your name, email
                  address, and profile picture when you choose Google sign-in.
                </li>
                <li>
                  <strong className="text-gray-900">Polar:</strong> receives
                  your Relay account identifier, name, email address, selected
                  plan, and subscription metadata when you start or manage a
                  paid subscription. Payment details are handled by Polar and
                  its payment processor, not stored by Relay.
                </li>
                <li>
                  <strong className="text-gray-900">Resend:</strong> receives
                  your email address and the transactional email content and
                  delivery metadata needed when Relay sends account,
                  verification, billing, or service emails.
                </li>
                <li>
                  <strong className="text-gray-900">
                    Legal authorities or a successor:
                  </strong>{" "}
                  we may disclose data when required by applicable law or to
                  protect against fraud, abuse, or security threats. Data would
                  be transferred as part of a merger, acquisition, or sale only
                  after obtaining any consent required by applicable policy or
                  law.
                </li>
              </ul>
              <p>
                Captured chat content, project memory, Ask Relay messages, and
                uploaded files are not shared with analytics, billing, or
                email providers. They are shared only with the infrastructure,
                storage, and AI-processing providers described above as needed
                to deliver the feature you requested.
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
              <p>
                For the Chrome Web Store privacy disclosure, Relay may collect
                the following categories when you use the extension: personally
                identifiable information (name, email address, and profile
                picture for account sign-in), authentication information
                (session and device tokens), website content (supported AI chat
                text and relevant chat markup), personal communications and
                user-generated content (Ask Relay messages, selected text, and
                files you submit), optional microphone access for voice input
                handled by Chrome&apos;s speech-recognition service, user
                activity and analytics events (feature usage, errors, browser
                type, operating system, approximate country-level region, and
                extension version), and extension settings (connection state,
                capture preferences, project selection, and enabled
                platforms).
              </p>
              <p>
                Relay&apos;s use of information received from Google APIs will
                adhere to the Chrome Web Store User Data Policy, including the
                Limited Use requirements.
              </p>
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
                  any individual item from your dashboard at any time. To
                  delete all data tied to your Relay account, use{" "}
                  <strong className="text-gray-900">
                    Settings → Account → Delete account
                  </strong>{" "}
                  in the dashboard, or email{" "}
                  <a
                    href="mailto:support@onrelay.app"
                    className="text-gray-900 underline underline-offset-2"
                  >
                    support@onrelay.app
                  </a>{" "}
                  from the address tied to your account. Account-wide deletions
                  are processed within 7 days; analytics events held by PostHog
                  are deleted on the same request.
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
