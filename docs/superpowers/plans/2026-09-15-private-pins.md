# Private Pins Implementation Plan

> For agentic workers: use the subagent-driven-development skill for independent work and review. The controller owns app integration and Git publishing.

**Goal:** Deliver a runnable private pin collection MVP with server-enforced user isolation and secret-safe Git history.
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
- [ ] Add secret exclusions and placeholder configuration before setup.
- [ ] Install current compatible Expo dependencies and create app configuration.
- [ ] Create repository contracts and domain validation. Write behavioral tests that reject empty/oversized inputs and unsafe configuration; observe failure, implement, rerun.
- [ ] Build auth/session handling, collections list, pin list/details/editor and photo picker against repository contracts.
- [ ] Add accessible pending/error/empty states and responsive web preview.

## Task 2: Private backend and media (backend agent)
**Files:** supabase/config.toml; supabase/migrations/*.sql; supabase/functions/media/**; tests/backend/**; docs/BACKEND.md.
**Interface:** tables collections(id,owner_id,name,description,created_at), pins(id,owner_id,collection_id,title,notes,created_at,updated_at), pin_images(id,pin_id,owner_id,full_key,thumb_key,bytes,created_at). UUID ids. Owner defaults to auth.uid(). Function media actions: upload {pinId,imageBase64,thumbnailBase64}; read {pinIds:string[]} returns {images:[{pinId,url,thumbnailUrl,expiresAt}]}; delete-pin {pinId}; delete-collection {collectionId}; delete-account. Function output upload {ok:true}; deletes {ok:true}. If adjusting contracts, tell controller before implementation.
- [ ] Write and run failing database isolation tests for two users, anonymous access, forged parent ownership, reassignment, and quota.
- [ ] Implement schema, grants, policies, constraints and transactional quotas; run tests to green.
- [ ] Write bounded upload/JPEG validation tests, then implement authenticated media endpoint using R2 server credentials, fixed owner keys, short-lived reads, retry-safe deletion. Enforce limits before consuming unbounded request bodies.
- [ ] Document SQL deployment, Auth settings, R2 bucket/secrets, CORS, cleanup and integration checks.

## Task 3: Verification, documentation and GitHub (controller + reviewer)
- [ ] Add scripts for staged secret detection and CI; test rejection using synthetic fixtures without printing secret values.
- [ ] Run typecheck, domain/backend tests, Expo dependency check and web export.
- [ ] Review backend and UI integration against interfaces, ownership rules and failure paths; fix findings and rerun affected tests.
- [ ] Document exact setup and external information needed, plus build and release steps.
- [ ] Review staged diff and scan it, commit source, connect the user-selected GitHub repository and push. If remote info is missing, leave local commit ready and name the required detail.
