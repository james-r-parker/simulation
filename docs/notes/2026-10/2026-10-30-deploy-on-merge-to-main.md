### 2026-10-30 - Deploy on merge to main

`.github/workflows/deploy.yml` deploys `main` to production on Cloudflare Pages (project `matrix`) after the `check` workflow succeeds on a push, with the repo's pinned wrangler and the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; `workflow_dispatch` redeploys main's HEAD. Roll back from the Pages dashboard or by redeploying. This is the interim pipeline ahead of `deployment-and-community.md` Phase 1 (Release Please, `/v/<version>/`, `/next/`, PR previews), which replaces it.
