import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Service — Relay",
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Last updated: April 2, 2026
        </p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              1. Acceptance of Terms
            </h2>
            <div className="space-y-3">
              <p>
                By accessing or using Relay (&quot;the Service&quot;), you agree
                to be bound by these Terms of Service. The Service is provided
                by Alimkhan Yergebayev, an individual based in Kazakhstan. If
                you do not agree to these terms, do not use the Service.
              </p>
              <p>
                You must be at least 13 years old to use the Service. If you
                are under 18, you must have parental or guardian consent.
                Continued use of the Service after updates to these terms
                constitutes acceptance of the updated terms.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              2. Service Description
            </h2>
            <p>
              Relay is a productivity tool that captures context from your AI
              chat sessions (including but not limited to ChatGPT, Claude,
              Gemini, Grok, Codex, Perplexity, and DeepSeek) and
              automatically maintains a project canon — the stable truth
              about your project. Relay generates context packets you can
              insert into new chats or receive via MCP. Canon entries may be
              promoted tentatively and locked by you; memory items may be
              demoted or archived once covered by canon or summaries (but are
              never deleted). The Service consists of a web dashboard, a
              Chrome browser extension, and MCP-connected IDE agent
              integrations. Features may differ between Free, Starter, and
              Pro tiers, and we reserve the right to modify features as the
              Service evolves.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              3. Account &amp; Authentication
            </h2>
            <p>
              You must sign in with a Google account to use the Service. You
              are responsible for maintaining the security of your account and
              keeping your login credentials safe. Your account is personal
              and non-transferable. The Chrome extension connects to your
              account via a secure device token issued during the pairing
              flow.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              4. Data You Provide
            </h2>
            <p>
              Relay captures and stores the full text content of AI chat
              sessions you conduct while the extension is active, connected,
              and capture is enabled by you. This includes your messages to AI
              tools, the AI&apos;s responses, and associated HTML markup from
              the chat interface. Relay also generates and stores derived
              content such as project summaries, decisions, tasks, and
              constraints extracted from your chats.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              5. User Responsibilities
            </h2>
            <div className="space-y-3">
              <p>As a Relay user, you are responsible for:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Using the Service lawfully and in compliance with all
                  applicable laws and regulations
                </li>
                <li>
                  Maintaining the security of your account credentials
                </li>
                <li>
                  The content of the chats you conduct and the data captured
                  by Relay
                </li>
                <li>
                  Not sending sensitive personal information (passwords,
                  financial data, health records) through AI chats while Relay
                  is capturing
                </li>
                <li>
                  Reporting security vulnerabilities to us promptly
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              6. Prohibited Conduct
            </h2>
            <div className="space-y-3">
              <p>The following activities are strictly prohibited:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Using the Service for any illegal or unauthorized purpose
                </li>
                <li>
                  Disrupting or interfering with our servers or networks
                </li>
                <li>
                  Creating multiple accounts to bypass limitations
                </li>
                <li>
                  Unauthorized automated access, scraping, or reverse
                  engineering of the Service
                </li>
                <li>
                  Attempting to gain unauthorized access to other
                  users&apos; accounts or data
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              7. Intellectual Property
            </h2>
            <div className="space-y-3">
              <p>
                You retain ownership of the content captured from your chats.
                Relay does not claim any intellectual property rights over your
                data.
              </p>
              <p>
                The Service itself, including its code, design, and branding,
                is the property of Alimkhan Yergebayev. You may not copy,
                modify, or distribute the software without permission.
                Feedback and suggestions you provide may be used to improve
                the Service without obligation.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              8. Service Availability
            </h2>
            <div className="space-y-3">
              <p>
                We strive to provide reliable and consistent service, but we
                do not guarantee uninterrupted availability. The Service may
                experience downtime for maintenance, updates, or
                circumstances beyond our control. Beta and experimental
                features are provided &quot;as is&quot; and may have
                additional limitations.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              9. Limitation of Liability
            </h2>
            <div className="space-y-3">
              <p>
                The Service is provided &quot;as is&quot; without warranties
                of any kind, express or implied. Alimkhan Yergebayev shall not
                be liable for any indirect, incidental, special, or
                consequential damages arising from the use of the Service.
              </p>
              <p>
                In no event shall our total liability exceed the amount you
                have paid us in the 12 months preceding the claim. Users
                should maintain their own backups of important data.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              10. Service Modifications
            </h2>
            <p>
              We reserve the right to modify, suspend, or discontinue the
              Service at any time. We will make reasonable efforts to provide
              advance notice of significant changes. Pricing and feature
              changes will be communicated before taking effect.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              11. Termination
            </h2>
            <div className="space-y-3">
              <p>
                You may delete your account and all associated data at any
                time via the Settings page. We reserve the right to suspend or
                terminate accounts that violate these terms. Termination does
                not affect any outstanding payment obligations. Data may be
                retained as described in our{" "}
                <Link
                  href="/privacy"
                  className="text-gray-900 underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              12. Governing Law
            </h2>
            <div className="space-y-3">
              <p>
                These terms are governed by and construed in accordance with
                the laws of the Republic of Kazakhstan. Any disputes shall
                first be resolved through good-faith negotiation, and if
                unresolved, in the courts of Kazakhstan. Any claims must be
                brought individually — class actions are not permitted.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              13. Changes to Terms
            </h2>
            <p>
              We may update these terms periodically. Material changes will be
              communicated via email or a notice on the dashboard. Continued
              use of the Service after changes constitutes acceptance. We
              recommend reviewing these terms regularly.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              14. Contact
            </h2>
            <p>
              If you have questions about these terms, contact us at{" "}
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

        <p className="mt-12 text-sm text-gray-400">
          By using Relay, you acknowledge that you have read, understood, and
          agree to be bound by these Terms of Service. If you do not agree
          with any part of these terms, please do not use our services.
        </p>
      </div>
    </main>
  );
}
