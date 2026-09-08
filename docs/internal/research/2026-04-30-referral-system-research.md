<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Referral system research

I want to finally get paid users. I have 22 free ones. No paid.

I am thinking that besides onboarding I should show on sign up somewhere to show plans and let the users to stay free or immediately convert. I am not sure if this would be good tho. Also I am thinking of implementing a referral system. Not sure how to do it properly tho. Like I could generate some invite codes for users that they could sign up with using that link with code or maybe by inserting it on sign up and then if they invite 3 or 5 users then give them 1 month of starter plan. Or if they get me 1 paid user then a 50% discount, if 2 then 75% and 3 then 100%. I am not sure what the numbers should be actually.

Great question, and worth thinking through carefully — because with 22 free users and **0 paid**, a referral program right now would mostly generate more free users. You need to fix conversion first, then layer referrals on top. Here's a full breakdown:

***

## Fix Conversion Before Referrals

The core problem: if people aren't converting now, inviting 10 more free users doesn't help you — it just grows your support burden. Ask yourself first: **do your current 22 users even know there's a paid plan?**

Your idea of showing pricing on sign-up is directionally right. The best pattern is a **"choose your plan" step at the end of onboarding**, not at the very start. Show it *after* they've seen the value — right after the first meaningful action in the product (e.g., after they connect their first context/workspace in Relay). At that point show a simple 2-option screen: Stay on Free (with clear limits) or Upgrade to Starter (with clear value adds). This is called a **paywall moment**, and it works because the user has just felt the product's value.[^1_1]

Also send a direct email to your 22 users explaining what the paid plan unlocks. At 22 users, manual outreach beats automation.[^1_2]

***

## Referral System Logic

Once you have at least a few paid users (or even while you're growing free users strategically), here's how to build the referral system properly:

### Two-Sided Program (Strongly Recommended)

Reward **both** the referrer and the new signup. ~65% of referrers prefer programs where both sides benefit. For Relay:[^1_3]

- **Referrer gets:** Extended plan credits or discount
- **Referee gets:** A 14-day free trial of the paid plan (instead of going straight to the free tier)

The referee bonus is key — it seeds paid conversions from the very first signup moment.

### Mechanics

Use a **unique referral link per user** (not just a code to insert), since links have near-zero friction. You can also support a manual code entry on signup as a fallback. The flow:

1. User gets their unique link from their dashboard (`relay.one/ref/USERNAME`)
2. New signup visits the link → cookie stores the referral attribution
3. On signup, a banner shows: *"You were invited by [Name] — get 14 days of Starter free"*
4. System tracks: how many signups this referrer brought → triggers reward

### Reward Structure

Your two ideas are actually for **different program types** — pick one, don't mix them:


| Program Type | Best for | Structure |
| :-- | :-- | :-- |
| **Free-user referrals** | Growing your user base | 3–5 signups → 1 free month of Starter |
| **Paid-user referrals** | Revenue growth | 1 paid conversion → 50% off, 2 → 75% off, 3 → 100% (1 month free) |

For your current stage (0 paid users), **start with the free-user referral program** to grow your base, but make it conditional: the reward only triggers when the referred user **activates** (completes onboarding), not just signs up. This avoids spam referrals.[^1_4]

Once you have paid users, layer in the paid referral track. The numbers you proposed (50% → 75% → 100%) are reasonable, but frame it as **account credits** rather than discounts — credits feel more like a gift and don't train users to expect discounts on renewals.

***

## Technical Implementation

**Database schema (simplified):**

```sql
-- referral_codes table
id, user_id, code (unique slug), created_at

-- referrals table
id, referrer_id, referee_id, status (pending/activated/rewarded),
reward_type (free_month/credit), created_at, activated_at

-- reward_credits table
id, user_id, amount_months, reason, expires_at, applied_at
```

**Key logic steps:**

1. On user creation → auto-generate a referral slug (e.g., nanoid) and store it
2. On signup with `?ref=SLUG` → store `referral_pending` with referrer ID in the new user's record
3. On activation trigger (first meaningful action completed) → mark referral as `activated`, check referrer's count
4. Count check: if referrer has 3+ activated referrals → create a `reward_credit` for 1 free month
5. On billing cycle → check for unused `reward_credits` before charging

**Dashboard widget to show users their referral status:**

```
Your referral link: relay.one/ref/yourname  [Copy]
Invited: 2 / 3 users activated
Reward: 1 free month unlocked at 3 ✓
```


***

## Timing for the Referral Ask

Don't show the referral prompt on first login. Show it at **milestone moments**:[^1_4]

- Right after onboarding completion
- After first successful context sync
- In the "You're on the free plan" upgrade nudge — add a secondary CTA: *"Not ready to upgrade? Invite friends instead →"*

This last one is the smartest placement for your situation — it gives free users a **path to earn the plan** without paying, which motivates them to market Relay for you.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://strafecreative.co.uk/insights/saas-free-to-paid-conversions/

[^1_2]: https://infiniteany.com/blog/referral-program-new-saas

[^1_3]: https://payproglobal.com/how-to/build-saas-referral-program/

[^1_4]: https://referralrock.com/blog/starting-your-saas-referral-program/

[^1_5]: https://www.dansiepen.io/growth-checklists/saas-referral-program-strategies-optimisations

[^1_6]: https://crunch-marketing.com/blog/saas-referral-program/

[^1_7]: https://www.prefinery.com/blog/scale-saas-referral-programs-10-best-practices/

[^1_8]: https://influenceflow.io/resources/saas-pricing-page-best-practices-a-complete-2026-guide/

[^1_9]: https://refgrow.com/blog/referral-program-best-practices

[^1_10]: https://impact.com/referral/saas-referral-program-guide/

[^1_11]: https://zokri.com/blog/strategy/5-highly-effective-referral-program-ideas-to-generate-saas-leads/

[^1_12]: https://sharemysaas.com/blog/referral-program-ideas

[^1_13]: https://thecfoclub.com/operational-finance/free-to-paid-conversion-strategy/

[^1_14]: https://viral-loops.com/blog/referral-program-for-saas-startups/

[^1_15]: https://refgrow.com/blog/referral-program-incentives

