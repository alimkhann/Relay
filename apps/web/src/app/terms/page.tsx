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
          Last updated: March 12, 2026
        </p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              1. Agreement
            </h2>
            <p>
              By accessing or using Relay ("the Service"), you agree to be bound
              by these Terms of Service. The Service is provided by Alimkhan
              Yergebayev, an individual based in Kazakhstan. If you do not agree
              to these terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              2. Description of Service
            </h2>
            <p>
              Relay is a productivity tool that captures context from your AI
              chat sessions (including but not limited to ChatGPT, Claude,
              Codex, and Perplexity) and generates project briefs you can insert
              into new chats. The Service consists of a web dashboard and a
              Chrome browser extension.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              3. Account &amp; Authentication
            </h2>
            <p>
              You must sign in with a Google account to use the Service. You are
              responsible for maintaining the security of your account. The
              Chrome extension connects to your account via a secure device
              token issued during the pairing flow.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              4. Data You Provide
            </h2>
            <p>
               Relay captures and stores the full text content of AI chat
               sessions you conduct while the extension is active, connected,
               and capture is enabled by you.
               This includes your messages to AI tools and the AI's responses.
              Relay also generates and stores derived content such as project
              summaries, decisions, tasks, and constraints extracted from your
              chats.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              5. Your Responsibilities
            </h2>
            <p>
              You agree not to use the Service for any unlawful purpose or in
              violation of any applicable laws. You are solely responsible for
              the content of the chats you conduct and the data captured by
              Relay. Do not send sensitive personal information (passwords,
              financial data, health records) through AI chats while Relay is
              capturing.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              6. Intellectual Property
            </h2>
            <p>
              You retain ownership of the content captured from your chats.
              Relay does not claim any intellectual property rights over your
              data. The Service itself, including its code, design, and
              branding, is the property of Alimkhan Yergebayev.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              7. Limitation of Liability
            </h2>
            <p>
              The Service is provided "as is" without warranties of any kind,
              express or implied. Alimkhan Yergebayev shall not be liable for
              any indirect, incidental, special, or consequential damages
              arising from the use of the Service. The Service is in beta and
              may contain bugs or experience downtime.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              8. Service Modifications
            </h2>
            <p>
              We reserve the right to modify, suspend, or discontinue the
              Service at any time. We will make reasonable efforts to provide
              advance notice of significant changes. Pricing and feature changes
              will be communicated before taking effect.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              9. Termination
            </h2>
            <p>
              You may delete your account and all associated data at any time
              via the Settings page. We reserve the right to terminate accounts
              that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              10. Governing Law
            </h2>
            <p>
              These terms are governed by and construed in accordance with the
              laws of the Republic of Kazakhstan. Any disputes shall be resolved
              in the courts of Kazakhstan.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              11. Contact
            </h2>
            <p>
              If you have questions about these terms, contact us at{" "}
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
