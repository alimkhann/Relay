import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Refund Policy — Relay",
};

export default function RefundPage() {
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
          Refund Policy
        </h1>
        <p className="mt-2 text-sm text-gray-400">Last updated: May 16, 2026</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              7-Day Money-Back Guarantee
            </h2>
            <div className="space-y-3">
              <p>
                If you&apos;re not satisfied with a paid Relay plan, you can
                request a full refund within{" "}
                <strong className="text-gray-900">7 days</strong> of your
                purchase. No questions asked — just email us and we&apos;ll take
                care of it.
              </p>
              <p>
                Refunds are returned to your original payment method and
                typically settle within 5–7 business days, depending on your
                bank or card provider.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Eligibility
            </h2>
            <p>You qualify for a refund if:</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>You are a first-time subscriber within the 7-day window.</li>
              <li>
                A technical issue prevented you from using the Service and we
                were unable to resolve it.
              </li>
              <li>The purchase was accidental or duplicated.</li>
              <li>
                Your request is made within 7 days of the original charge.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Non-Refundable Situations
            </h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Requests made more than 7 days after purchase.</li>
              <li>Repeated refund requests from the same account.</li>
              <li>
                Accounts terminated for violating our{" "}
                <Link
                  href="/terms"
                  className="text-gray-900 underline underline-offset-2"
                >
                  Terms of Service
                </Link>
                .
              </li>
              <li>
                Partial refunds for unused time on an active monthly
                subscription.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Subscription Cancellation
            </h2>
            <div className="space-y-3">
              <p>
                You can cancel anytime from your billing settings with no
                penalty. Your plan remains active until the end of the current
                billing period, after which it will not renew. You can
                resubscribe at any time.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Annual Subscriptions
            </h2>
            <p>
              The 7-day money-back guarantee applies to annual plans as well.
              After the 7-day window, annual subscriptions are non-refundable,
              but you keep access for the full period you paid for and the plan
              will not auto-renew if cancelled before the renewal date.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Free Trials
            </h2>
            <p>
              If a plan includes a free trial, you are not charged during the
              trial period. Cancel before the trial ends to avoid any charge.
              No charge means there is nothing to refund.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              How to Request a Refund
            </h2>
            <p>
              Email{" "}
              <a
                href="mailto:support@onrelay.app"
                className="text-gray-900 underline underline-offset-2"
              >
                support@onrelay.app
              </a>{" "}
              from the address on your account and include any helpful detail
              (optional feedback is appreciated but never required). We aim to
              respond within 24–48 hours; approved refunds are processed within
              5–7 business days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Payment Disputes
            </h2>
            <p>
              Please contact us before filing a chargeback — we can almost
              always resolve issues faster directly. Accounts with an open
              chargeback may be suspended until the dispute is resolved.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Contact
            </h2>
            <p>
              Questions about this policy? Reach us at{" "}
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
