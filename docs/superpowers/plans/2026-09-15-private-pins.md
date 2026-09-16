# Private Pins Implementation Plan

> For agentic workers: use the subagent-driven-development skill for independent work and review. The controller owns app integration and Git publishing.

**Current goal:** Finish a runnable frontend with an explicitly isolated demo, placeholder configuration and secret-safe Git history. Live backend setup is deferred by the user; retain its draft source and database relations plan for the next phase.
**Architecture:** Expo mobile client consumes small repository interfaces; Supabase stores identities and pin metadata; one authenticated Edge Function manages private R2 photos.
**Tech Stack:** React Native, Expo, TypeScript, Supabase PostgreSQL/Auth/Edge Functions, Cloudflare R2.
**Spec:** docs/superpowers/specs/2026-09-15-private-pins-design.md

## Global Constraints
- Never put server secrets in mobile configuration or tracked files.
- Private collections and photos must enforce ownership server-side.
- Do not claim a live deployment without remote credentials and verification.
- Keep Supabase calls outside presentation components.
- No public galleries, follows, likes, or recommendation feed in this MVP.

## Task 1: Repository and mobile foundation (controller)
- [x] Add secret exclusions and placeholder configuration before setup.
- [x] Install current compatible Expo dependencies and create app configuration.
- [x] Create repository contracts and domain validation. Write behavioral tests that reject empty/oversized inputs and unsafe configuration; observe failure, implement, rerun.
- [x] Build auth/session handling, collections list, pin list/details/editor and photo picker against repository contracts.
- [x] Add accessible pending/error/empty states and responsive web preview.

## Task 2: Private backend and media (draft source retained; integration deferred)
**Files:** supabase/config.toml; supabase/migrations/*.sql; supabase/functions/media/**; tests/backend/**; docs/BACKEND.md.
**Interface:** tables collections(id,owner_id,name,description,created_at), pins(id,owner_id,collection_id,title,notes,created_at,updated_at), pin_images(id,pin_id,owner_id,full_key,thumb_key,bytes,created_at). UUID ids. Owner defaults to auth.uid(). Function media actions: upload {pinId,imageBase64,thumbnailBase64}; read {pinIds:string[]} returns {images:[{pinId,url,thumbnailUrl,expiresAt}]}; delete-pin {pinId}; delete-collection {collectionId}; delete-account. Function output upload {ok:true}; deletes {ok:true}. If adjusting contracts, tell controller before implementation.
- [x] Write and run failing database isolation tests for two users, anonymous access, forged parent ownership, reassignment, and quota.
- [x] Implement schema, grants, policies, constraints and transactional quotas; run tests to green.
- [x] Write bounded upload/JPEG validation tests, then implement authenticated media endpoint using R2 server credentials, fixed owner keys, short-lived reads, retry-safe deletion. Enforce limits before consuming unbounded request bodies.
- [x] Document SQL deployment, Auth settings, R2 bucket/secrets, CORS, cleanup and integration checks.

## Task 3: Verification, documentation and GitHub (controller + reviewer)
- [x] Add scripts for staged secret detection and CI; test rejection using synthetic fixtures without printing secret values.
- [x] Run typecheck, domain/backend tests, Expo dependency check and web export.
- [x] Review backend and UI integration against interfaces, ownership rules and failure paths; fix findings and rerun affected tests.
- [x] Document exact setup and external information needed, plus build and release steps.
- [x] Review staged diff and scan it; prepare source for the existing GitHub remote.
- [ ] Push the completed frontend commit to the existing `origin/codex/private-pin-mvp` branch.

## Frontend-first acceptance
- [x] Add an in-memory repository with six sample pins and an explicit Try the demo entry.
- [x] Disable service calls by default; require an explicit backend opt-in after integration.
- [x] Verify demo isolation/reset, mobile gallery flows and connected UI failure paths with fixtures.
- [x] Document tables, relations, configuration and deferred work in docs/INTEGRATION-PLAN.md.
- [ ] Next phase: fix the backend stale-upload retry race, apply tables, configure services and verify two real accounts.
- [ ] Next phase: test signed native builds on Android/iOS devices and prepare store publication.
