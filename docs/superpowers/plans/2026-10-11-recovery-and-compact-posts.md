# Password Recovery and Compact Posts Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task in the current chat. The user intends a smaller model to do the implementation. Do not delegate or expand into a general authentication rewrite. Steps use checkboxes for tracking.

**Goal:** Make password recovery work through an emailed code and make social posts compact, accessible, and visually contained in one card.

**Architecture:** Keep Supabase Auth as the password-recovery authority and correct its recovery email template. Reuse the existing recovery verification and session events. Keep existing social repositories, privacy checks, image loaders, and like store; introduce a small presentation component and compact variants of the social controls.

**Tech Stack:** Expo / React Native / React Native Web, TypeScript, Supabase Auth, Lucide icons, Node tests, Playwright, Vercel.

**Spec:** The design brief in this document implements the user's October 11 request and screenshot. This document is the handoff; no application code or hosted settings were changed while planning.

## Design brief

### A. Code-first password recovery

Intended flow:

1. Select **Forgot password?** and enter an email address.
2. Complete the existing security check when sending the request.
3. Receive an email containing a clearly visible, copyable recovery code.
4. Enter the code in Collectibles, then choose and confirm a new password.
5. See a success confirmation and continue to My collections. Cancel signs out of the recovery session.

The email may contain a plain **Open recovery screen** link to `https://www.sharecollectibles.com/auth/recovery`. That link opens the code-entry form; it contains no code, email, token hash, or session credential and does not authenticate anyone. The user can read the email on another device and enter the code in the original app.

**Legacy-link decision:** New emails use codes. Previously issued link-only emails get an explanatory recovery screen and an action to request a fresh code. Do not add automatic acceptance of arbitrary URL access tokens or weaken the Google/Apple callback checks to make old emails work. Ambiguous root-level email callbacks must use neutral wording, rather than pretending every email link was a password reset.

### B. One compact post card

Desktop illustration (icons represented by text here):

```text
┌────────────────────────────────────┐
│                                    │
│               Photo                │
│                                    │
├────────────────────────────────────┤
│ Georgia pin                        │
│ Pins                               │
│ @collector            [user+] [♡ 2] │
└────────────────────────────────────┘
```

- Image, item title, collection name, username, and actions share one rounded card surface and border.
- The username opens the collector profile. The photo/title opens the existing item detail view.
- Follow uses a user-plus icon. Following uses a distinct user-minus icon whose tooltip says **Unfollow**. A follow-back action is labeled **Follow back** in the tooltip and accessibility name.
- Like uses an outline heart; liked uses a **filled red heart**. The visible count is a small number beside the heart, including zero. Do not display “Like”, “Liked”, or “Following” as visible button text on posts.
- Hover and keyboard focus show a tooltip. Touch users get recognizable icons and screen-reader labels; the action never requires hover or a long press.
- Keep 48-by-48 minimum touch targets with roughly 20-pixel icons. Compact means removing the two full-width button rows, not making controls hard to tap.
- At narrow widths, the username gets its own line and the actions share one short row. Never squeeze two targets and a username into an overflowing two-column mobile card.
- Apply compact post actions to Explore entry cards and details, and to Following/profile/shared-entry cards and details. People-management controls and the collector-profile header may retain labeled buttons.
- Explore **Collections** cards represent grouped collections, not individual posts: keep their current navigation and omit item-level like/follow actions.

## Global constraints

- Planning baseline: clean `main`, commit `98d387761cb4767e60dab49ead9f07c8ef39441a`. Recheck the working tree before implementation; preserve later user changes.
- Production origin is `https://www.sharecollectibles.com`. Build URLs must use the existing validated environment configuration, not hard-coded localhost or the retired default Vercel host.
- Preserve passwords of at least 8 characters with one uppercase letter, one lowercase letter, and one number; do not require a symbol.
- Supabase verifies recovery codes and changes passwords. Never implement local OTP generation, custom password tables, service-role auth in the client, or account-existence disclosure.
- Preserve Turnstile, server rate limits, OAuth PKCE checks, analytics redaction, and session isolation. A UI cooldown is not server enforcement.
- Keep private/Friends/public visibility, mutual-follow confirmation, blocks, reports, moderation, media authorization, and upload budgets unchanged.
- Preserve all real accounts, photos, social relationships, likes, and social rollout flags. No database migration or R2 change is expected.
- No passwords, email codes, tokens, or real recovery URLs in logs, screenshots, test fixtures, Git, or the handoff.
- No new UI library is needed. Keep the existing themes and plain in-app copy.
- Complete the tasks locally before deploying. A local template file or frontend deployment alone does not change Supabase's hosted email template.

## Findings from the current code

| Area | Verified behavior | Consequence |
| --- | --- | --- |
| `src/auth/session.ts` | `sendReset` uses `resetPasswordForEmail` without `redirectTo`; `verifyReset` already uses `verifyOtp({ email, token, type: 'recovery' })`. | Keep the correct verification method; align the email with it. |
| `src/lib/supabase.ts` | PKCE is enabled and `detectSessionInUrl` is false. | Landing on the app with an email link does not automatically complete recovery. |
| `src/auth/oauthFlow.ts` | Callback exchanges require a saved Google/Apple flow context. | Email recovery has no matching context and is ignored. Do not remove these OAuth safeguards. |
| Installed Supabase SDK | Successful recovery-code verification emits `PASSWORD_RECOVERY`. | The current event subscription is a useful foundation; a separate custom sign-in mechanism is unnecessary. |
| `src/screens/AuthScreen.tsx` | There is a code field but no dedicated recovery resend/edit-email flow. `RecoveryScreen` exists; recovery state is held only in memory. | Improve resend, transitions, failures, and refresh behavior. |
| `supabase/config.toml` / `docs/AUTH-OPERATIONS.md` | No checked-in recovery template. Config still uses the old Vercel domain; the operations guide says a code template is required. | Add reproducible template instructions and distinguish local config from hosted settings. |
| `src/screens/PublicCatalog.tsx` | The bordered pressable ends before username/follow/like markup. | This is the source of the separated appearance in the screenshot. |
| `src/social/SharedEntryCard.tsx` | Already has one outer card, but renders a large Like button. | Reuse the visual treatment without replacing protected-image loading. |
| Guest Explore | `GuestExploreScreen` renders outside `SocialProfileProvider`. | Do not insert context-dependent social components into this path without handling this explicitly. |

The hosted recovery template was **not inspected** during planning. The email behavior is reported by the user and is consistent with a link-only template. Verify the selected Supabase project's template before changing it.

## Review focus

1. Invalid/expired/replayed codes or a resend must never bypass verification or update a password for the wrong email. Covered by Task 1.
2. Recovery refresh, stale responses, and old email links must not silently route into the normal library or interfere with Google/Apple login. Covered by Tasks 1–2.
3. Liking/following must not open the photo, and photo taps must not follow anyone. Covered by Tasks 3–4.
4. Several cards from the same collector, an open detail sheet, and a failed request must remain consistent. Covered by Task 4.
5. Guest/own/blocked posts, dark theme, narrow screens, keyboard users, and screen readers must all have usable actions. Covered by Tasks 3–5.

## Implementation order and checkpoints

1. **Recovery:** Tasks 1–2. Independently releasable once the hosted template is updated and real email recovery passes.
2. **Post presentation:** Tasks 3–4. Independently releasable; no backend/schema deployment required.
3. **Full verification and release record:** Task 5.

Each task should end with a focused commit after its checks pass. At a usage-limit interruption, record completed tasks, commands/results, remaining hosted steps, and the current commit in this document. Do not claim tests or deployment succeeded without running them.

---

## Task 1 — Complete recovery-code request, verification, and password update

**Files**

- Modify: `src/auth/session.ts`, `src/screens/AuthScreen.tsx`, `src/auth/security.ts`, `App.tsx`.
- Create: `src/auth/recovery.ts` for pure recovery intent/input/marker helpers; `tests/auth-recovery.test.ts`; `tests/e2e/password-recovery.spec.ts`.
- Update existing coverage: `tests/auth-security.test.ts`, and the fixture build/test settings only if necessary.

**Interfaces**

- Preserve `auth.sendReset(email: string, captchaToken?: string): Promise<void>` and `auth.verifyReset(email: string, token: string): Promise<void>`; their authority remains Supabase Auth.
- Add `RecoveryIntent = 'enter-code' | 'request-code' | 'legacy-link'` for presentation/navigation only. An intent never establishes a verified recovery session.
- Add `RecoveryMarker = { userId: string; startedAt: number }` persisted through existing `authStorage`; the marker contains no password or token. Restore it only with the matching authenticated session and a bounded age of one hour. It only restores the password form, never grants access.
- Extend `AuthScreen` with an optional initial recovery intent and a callback to clear that navigation intent on exit. Keep ordinary sign-in/signup as defaults.
- Keep `useSession().recovery` driven by successful recovery verification/events. Restore its marker during initialization before choosing the library route; clear on successful save, cancellation/sign-out, user change, or marker expiry.

**Steps**

- [ ] Write behavior tests first: recovery uses `/recover`, not signup/login OTP; verification uses `type: 'recovery'`; a failed verification cannot lead to `updateUser`; a successful verification opens New password before the library/profile-intro modal.
- [ ] Add browser fixtures that intercept Auth requests and return synthetic sessions. Exercise real UI transitions rather than checking source-code strings. Follow the backend-fixture approach already used in `tests/e2e/shared-refresh.spec.ts`; block unintended network calls.
- [ ] Keep one code field with numeric keyboard, paste support, and one-time-code autofill. Trim surrounding whitespace and preserve leading zeros. Reject blank/non-numeric/oversized input without sending a request. Accept up to 10 digits and let Supabase validate the configured length; do not promise a fixed six-digit code in UI/docs without checking hosted configuration.
- [ ] After requesting a code, lock the target email into the verification attempt. Add **Change email**, **Resend code**, and **Back to sign in**. Changing the email clears the old code/errors and returns to the request form.
- [ ] Add a 60-second local cooldown after successful send/resend and honor a longer server retry deadline. Resend uses `resetPasswordForEmail` again, with a fresh Turnstile token. Keep recovery resend separate from signup confirmation resend. Use generic delivery copy: “If an account uses this email, we sent a recovery code.”
- [ ] Make CAPTCHA requirements action-based: resend from the code-entry screen still needs CAPTCHA even though code verification itself does not run the email-send challenge. Capture the action/email for each attempt; ignore stale CAPTCHA/network completions after changing mode or unmounting. Suppress duplicate submissions.
- [ ] Map invalid/expired verification to “That code is invalid or has expired. Try again or request a new code.” Preserve separately actionable network/rate-limit errors. Do not claim a code is valid until verification succeeds.
- [ ] On verified recovery, clear shared/profile destinations and open `RecoveryScreen`. Add Confirm new password, matching validation, pending-state input protection, a show/hide control, and a success confirmation. Keep failed updates in the recovery form. Prevent repeated save requests.
- [ ] Persist/clear the recovery UI marker outside the auth event callback's critical section; do not await additional Supabase auth calls inside `onAuthStateChange`. Handle initialization/event races and stale marker reads. Cancellation must actually sign out before dropping the recovery view.
- [ ] Test: wrong code, leading-zero code, expired/used code, wrong email, changed email, repeated clicks, resend CAPTCHA, resend cooldown, offline verify/save, weak/mismatched password, refresh before save, cancellation, and account switching. A fabricated marker/URL without a valid session cannot authorize a password update.
- [ ] Run focused Node and browser tests and type checking. Suggested commit: `fix: complete code-based password recovery`.

## Task 2 — Match the email template and web routing to recovery

**Files**

- Create: `supabase/templates/recovery.html`.
- Modify: `supabase/config.toml`, `vercel.json`, `src/auth/recovery.ts`, `App.tsx`, `src/auth/session.ts`, `docs/AUTH-OPERATIONS.md`.
- Test: extend `tests/auth-recovery.test.ts`, `tests/e2e/password-recovery.spec.ts`, `tests/auth-callbacks.test.ts`, `tests/analytics.test.ts` as relevant.

**Interfaces**

- `recoveryPageUrl(webUrl: string): string` returns a validated `/auth/recovery` URL on the configured app origin.
- `recoveryIntentFromUrl(value: string, webUrl: string): RecoveryIntent | null` recognizes the approved recovery route and explicitly identified legacy recovery responses. It must reject foreign origins and return only an intent, never credentials.
- Hosted email subject: **Reset your Collectibles password**. Template body displays `{{ .Token }}` prominently and explains where to enter it. An optional plain `{{ .SiteURL }}/auth/recovery` link opens the form. No `ConfirmationURL`, `TokenHash`, code in link/subject, or account details.

**Steps**

- [ ] Add tests for directly opening/refreshing `/auth/recovery`, existing OAuth callback behavior, auth-error URLs, rejected foreign origins, and sensitive-parameter cleanup.
- [ ] Add the Vercel rewrite `/auth/recovery` → `/index.html`. The existing local preview server already serves extensionless paths through the SPA. Keep this route separate from `/auth/callback`.
- [ ] New recovery requests supply the explicit recovery page as `redirectTo`. The code-first template does not need to redeem this redirect, but it prevents an accidental link-template fallback from silently dropping users on ordinary login.
- [ ] A clean `/auth/recovery` shows email + code entry with **Request a code** available. A clearly identified legacy recovery link shows a short explanation and **Send a new code**, with CAPTCHA. Scrub credentials/query fragments before rendering external widgets or recording navigation. Do not auto-exchange arbitrary URL tokens.
- [ ] Root-level `?code=...` callbacks without an approved OAuth context may also be signup links: show neutral “This email link could not be completed” guidance with sign-in/recovery options, rather than falsely identifying their type. Keep valid Google/Apple callback handling first and unchanged. Never overwrite an already signed-in account based solely on URL parameters; request an explicit switch/sign-out if needed.
- [ ] Verify recovery screens take priority over shared destinations and onboarding only while a recovery flow is active; normal policy and shared URLs continue to work. Confirm `safeAnalyticsEvent` omits `/auth` pages and strips callback credentials from root URLs.
- [ ] Create the checked-in HTML template and connect it through local `[auth.email.template.recovery]` configuration. Align local URL configuration with the custom domain while preserving necessary local/native/legacy destinations. Do not use a broad config push that overwrites unrelated live Auth settings.
- [ ] In the implementation/deployment stage, inspect **Supabase → Authentication → Emails → Reset password** (the template section may be labeled Email Templates). Verify project identity, save a private copy of the existing recovery template, and update only the recovery subject/body. If using the Management API, PATCH only `mailer_subjects_recovery` and `mailer_templates_recovery_content`. Keep management credentials private.
- [ ] Confirm Site URL is the canonical HTTPS origin and the recovery URL is allowed; an existing correctly scoped wildcard may already cover it. Record actual OTP length/expiry and resend restrictions. Preserve server rate limits and CAPTCHA. Do not promise a particular expiry in copy unless matched to the hosted setting.
- [ ] Update `docs/AUTH-OPERATIONS.md`: exact template, hosted-vs-local distinction, resend behavior, and real-email acceptance checklist. A Git commit or `db push` does not install this hosted template.
- [ ] Deploy/test the recovery page before linking to it from the email template. Verify one fresh email in an approved disposable mailbox: visible code, correct destination, verification, password update, sign-out, old password rejected, new password accepted, used code rejected. Test reading email on a different device. Do not reset a real user's password for this test.
- [ ] Run focused tests and type checking. Suggested commit: `fix: align recovery emails and recovery routes`. Record hosted template deployment separately from the commit.

## Task 3 — Accessible compact social controls

**Files**

- Create: `src/components/IconActionButton.tsx`.
- Modify: `src/social/LikeButton.tsx`, `src/social/FollowButton.tsx`, `src/theme/palette.ts`.
- Test: `tests/e2e/social-post-cards.spec.ts`; extend `tests/themes.test.ts` if a color contrast helper already exists.

**Interfaces**

- `IconActionButton` props: `{ label: string; icon: LucideIcon; onPress: () => void; active?: boolean; color?: string; fill?: string; count?: number; disabled?: boolean; busy?: boolean }`. Presentation only; no repository/context calls.
- Add `variant?: 'labeled' | 'compact'` to `LikeButton` and `FollowButton`; default to `'labeled'` so People/profile-header uses remain stable.
- Add a semantic `liked` palette color distinct from error styling: proposed `#C62828` for Classic/Fun and `#FF6B6B` for Dark. Check contrast against actual card surfaces.

**Steps**

- [ ] Add browser tests proving compact buttons have accessible names, visible focus, tooltips on hover/focus, a minimum 48-pixel target, and no visible full-word button labels. Test both toggle states.
- [ ] Implement the compact presentation using existing Pressable/Lucide components. Use a web-only tooltip or overlay that is not clipped by the rounded card; open on hover/focus, close on blur/leave/Escape, and do not intercept clicks. Ensure tooltip placement stays in the viewport. Avoid relying only on a browser `title` attribute.
- [ ] Map Like/Unlike to outline/filled heart and neutral/red color. Keep a compact count with an accessible description; hide decorative SVGs from screen readers. Use pressed/toggled semantics on web and the supported native accessibility state; do not confuse keyboard focus with selected state.
- [ ] Preserve the shared `social.likes` store, optimistic update, duplicate protection, rollback/error behavior, and authoritative count refresh. Pending requests disable repeated interaction without shifting the footer layout.
- [ ] Map Follow/Follow back/Unfollow to compact icons with state-aware tooltips and accessibility names identifying the collector. Keep unavailable, blocked, guest, and disabled states correct.
- [ ] Preserve the mutual-follow privacy confirmation. In compact mode show it in a small accessible sheet, rather than expanding the grid card into two full-width buttons. Label the effect clearly: following each other exposes existing and future Friends-only items. Cancel makes no request; confirm performs one request.
- [ ] Keep errors readable in an inline message area within the post or the active confirmation sheet. Do not hide failures inside a hover-only tooltip.
- [ ] Test red heart/filled state, rollback, busy state, follow-back cancel/confirm, tooltip change to Unfollow, keyboard activation, and theme changes while a post remains open.
- [ ] Run focused tests/type checking. Suggested commit: `feat: add compact accessible social actions`.

## Task 4 — Contain the complete post and keep state synchronized

**Files**

- Create: `src/components/PostCard.tsx` as a presentation-only card frame.
- Modify: `src/screens/PublicCatalog.tsx`, `src/social/SharedEntryCard.tsx`, `src/social/SharedEntryDetail.tsx`.
- Adjust callbacks where needed: `src/social/FollowingScreen.tsx`, `src/social/CollectorProfileScreen.tsx`, `src/social/VisibleCollectionScreen.tsx`.
- Test: `tests/e2e/social-post-cards.spec.ts`; replace brittle markup assertions in `tests/social-browsing-ui.test.ts` with behavior coverage for affected paths.

**Interfaces**

- `PostCard` props: `{ title: string; subtitle: string; media: React.ReactNode; onOpen: () => void; footer?: React.ReactNode; testID?: string }`. It owns the rounded border/surface, content pressable, and footer spacing; it does not load images or call social APIs.
- `SharedEntryCard` retains its existing props and adds `onRelationshipChanged?: (publisherId: string, relationship: Relationship) => void` where parent lists need to reconcile an action.

**Steps**

- [ ] Add a fixture with two posts from one collector, one own post, one missing-photo post, and an open detail view. Add a guest fixture outside `SocialProfileProvider`, matching the real Guest Explore composition.
- [ ] Move Explore entry markup into `PostCard`; all metadata/actions go within its single outer border. Keep the image/title pressable and footer pressables as siblings. Do not nest follow/like buttons inside a clickable whole-card button.
- [ ] Reuse `PostCard` in `SharedEntryCard`. Preserve `SharedEntryImage`, audience, accessRevision, cache/revalidation behavior, and existing public/demo photo loading. Do not coerce Friends entries to public cards or fetch extra collector details per card.
- [ ] Render username and compact follow/like in the footer. On own posts show a non-interactive heart/count and no self-follow/self-like. Missing creator metadata must not hide the post or fabricate a handle. Retain the Friends-only audience indicator for restricted entries.
- [ ] Choose the footer arrangement based on actual card width (e.g. measure its layout): at widths below 260 pixels put username above the single action row; wider cards use one row. Truncate long usernames with an accessible full name, preserve two title lines, and accommodate large text without overlaps.
- [ ] For Guest Explore, use the presentation-only icon buttons with `onSignIn` and labels such as “Sign in to like” / “Sign in to follow”. Do not mount `LikeButton`/`FollowButton` outside their required context. Tapping these controls must not attempt a social write or create an anonymous Auth user. Demo behavior stays isolated.
- [ ] Use compact controls in both Explore's selected-entry sheet and `SharedEntryDetail`; keep View full collection and safety/report controls distinct and usable. Retain labeled controls in People and collector-profile headers.
- [ ] After follow/unfollow, update relationship state for every loaded card from that publisher and the open detail, not just the clicked item. Reuse existing relationship invalidation to reconcile profile/list views and revoked Friends access. Avoid a full gallery reload on every like. Guard stale async responses and preserve the like store as the single count source.
- [ ] Test action click isolation, opening full entries/collections, multiple cards for one collector, list/detail like agreement, failed write rollback, guest nudges, own posts, blocked states, missing photos, empty results, pagination, and expired Friends access.
- [ ] Run focused tests/type checking. Suggested commit: `refactor: contain social posts in compact cards`.

## Task 5 — Verify platforms and release the two changes

**Files:** update this plan's checklist/results and `docs/AUTH-OPERATIONS.md`. Update `.github/workflows/verify.yml` only if new fixture tests require a missing setting.

- [ ] Run `npm run typecheck`, `npm test`, and `node scripts/check-secrets.mjs --all`.
- [ ] Build with the synthetic fixture configuration already defined in `.github/workflows/verify.yml`, with `EXPO_NO_DOTENV=1`. Run `npx expo export --platform all --clear --max-workers 2`, then `npm run test:e2e`. Include the new recovery/card tests; do not accidentally skip them by omitting `PLAYWRIGHT_BACKEND_FIXTURE=true`.
- [ ] If the recovery route needs a build-time web origin for fixtures, set `EXPO_PUBLIC_WEB_URL` to the local Playwright origin in that fixture job only. Never put a fixture URL/key or CAPTCHA bypass into a production build.
- [ ] Browser checks: phone widths 320/390, tablet 768, desktop 1440; Classic/Fun/Dark/System; long usernames/titles; keyboard navigation; 200% zoom. Inspect actual screenshots for one enclosing card and unclipped tooltips. Verify touch-target sizes and no horizontal overflow.
- [ ] Native checks when builds/devices are available: Android and iOS code paste/autofill, recovery resend CAPTCHA, foreground/background transitions, save/cancel, icon touch targets, screen-reader names, and follow-back sheet. A successful Expo export proves compilation, not physical-device behavior. Record unperformed device checks explicitly; do not block the web fix waiting for store accounts.
- [ ] Produce the real web build using the release configuration. Deploy and check `/auth/recovery` directly and after refresh on the custom domain. Keep the recovery template and web-release steps coordinated as in Task 2.
- [ ] Test real email recovery only with an approved disposable account/mailbox. Prefer staging; if production testing is needed, keep the scope explicit and clean up only test-owned records. Never print codes/passwords or use another person's account.
- [ ] Confirm existing sign-in/signup, Google/Apple callback parsing, Explore/Following, private/Friends reads, report/block, and owner uploads have no regression. Database tests already in `npm test` provide part of this coverage; do not claim live checks were run when only fixtures were used.
- [ ] Before release, inspect Git diff and secret-scan results. Report code commit, frontend deployment, hosted recovery-template status, tests run, and any remaining physical-device verification separately.

## Done means

- A fresh recovery email includes a working code. Entering it opens the password form, saving changes the password, and signing in with the new password succeeds.
- Invalid/expired codes do not grant recovery access. Resend works with CAPTCHA/cooldown. Old links show an actionable explanation instead of unexplained login.
- A post has one enclosing card, compact icon controls, accurate like/follow state, a red filled liked heart, and hover/focus labels.
- Mobile tapping, keyboard navigation, guest browsing, own posts, and all themes remain usable.
- No schema/R2 change, privacy weakening, public test credentials, or unsupported claim that native runtime testing is complete.

## References checked during planning

- Supabase supports using `{{ .Token }}` in email templates instead of an authentication link; hosted templates are edited separately from local configuration: [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- Recovery requests and password update are separate operations: [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) and [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).
- Local template configuration: [Customizing email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates).
- Server enforcement remains with Auth: [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

## Execution record

- Planning only, 2026-10-11: inspected current code and official Supabase documentation. No application changes, hosted changes, password-reset emails, or production tests performed.
- Tasks 1–5: pending implementation.
