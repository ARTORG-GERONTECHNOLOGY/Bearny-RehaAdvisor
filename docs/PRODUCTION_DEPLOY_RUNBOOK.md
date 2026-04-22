# Production Deploy Runbook

This is the canonical production deploy guide for `reha-advisor.ch`.
Use this document first when creating releases, rerunning deployments, or debugging failed deploys.

## Scope

- Release-triggered GitHub Actions deploys (`.github/workflows/deploy-prod.yml`)
- Manual reruns against an existing release tag
- Tag/image mapping and GHCR naming consistency
- Post-deploy verification and rollback caveats

## Prerequisites

- Branch to release is merged into `main`.
- Production workflow fixes are in `main`:
  - tag normalization (`vX.Y.Z` -> `X.Y.Z`)
  - raw normalized image tags are pushed to GHCR
  - post-deploy `manage.py` commands run inside Conda env `teleRehabApp`
- Production server has:
  - `/home/ubuntu/repos/telerehabapp-prod/.env.prod`
  - Docker access
  - GHCR login works from deploy workflow

## Source Of Truth For Runtime Values

Production runtime values are read from:

- `/home/ubuntu/repos/telerehabapp-prod/.env.prod` (on server)

Important distinction:

- `ENV_FILE_DEV` GitHub secret is used for CI test setup in workflow.
- `ENV_FILE_DEV` does **not** control production compose image selection.
- Production image source and tag come from:
  - `GHCR_IMAGE` in server `.env.prod`
  - `IMAGE_TAG` exported during deploy script

Required server value:

```env
GHCR_IMAGE=ghcr.io/artorg-gerontechnology/bearny-rehaadvisor
```

Warning:

- If `GHCR_IMAGE` points to a different namespace (for example `.../rehaadvisor`), deploy can fail with `manifest unknown` even when build succeeded.

## Tag And Image Mapping

- Git release tag format: `vX.Y.Z` (example: `v0.3.1`)
- GHCR runtime image tag: `X.Y.Z` (example: `0.3.1`)
- Deploy script uses:

```bash
IMAGE_TAG="${TAG#v}"
```

Why:

- Release tags include `v` for readability and SemVer release conventions.
- GHCR runtime pull is normalized to plain numeric tag.

## Happy Path (Release -> Deploy)

1. Merge changes into `main`.
2. Create and publish release tag `vX.Y.Z` from `main`.
3. Let `deploy-prod.yml` run on release publish.
4. Validate the build job pushed images for both components:
   - `${GHCR_IMAGE}-frontend:X.Y.Z`
   - `${GHCR_IMAGE}-backend:X.Y.Z`
5. Deploy job pulls tagged images and starts services.
6. Run post-deploy verification checks.

## Preflight Checklist Before Rerun

Run these checks before rerunning a failed deploy:

```bash
# 1) Tag exists in git
git ls-remote --tags origin | rg "refs/tags/v0\\.3\\.1$"

# 2) GHCR images exist for normalized tag
docker manifest inspect ghcr.io/artorg-gerontechnology/bearny-rehaadvisor-frontend:0.3.1 >/dev/null
docker manifest inspect ghcr.io/artorg-gerontechnology/bearny-rehaadvisor-backend:0.3.1 >/dev/null

# 3) Server runtime image base is correct
grep -n '^GHCR_IMAGE=' /home/ubuntu/repos/telerehabapp-prod/.env.prod
```

## Manual Rerun Commands (Server)

Use this if you need a deterministic rerun for an existing release tag:

```bash
set -euo pipefail
PROD_DIR=/home/ubuntu/repos/telerehabapp-prod
REPO_URL=https://github.com/ARTORG-GERONTECHNOLOGY/Bearny-RehaAdvisor.git
TAG="v0.3.1"

if [ ! -d "$PROD_DIR/.git" ]; then
  mkdir -p "$PROD_DIR"
  git -C "$PROD_DIR" init
  git -C "$PROD_DIR" remote add origin "$REPO_URL"
fi

cd "$PROD_DIR"
git fetch --all --tags --force
git checkout -f "$TAG"

test -f .env.prod
DC="docker compose -f docker-compose.prod.reha-advisor.yml --env-file .env.prod"
export IMAGE_TAG="${TAG#v}"

$DC pull
$DC up -d
sleep 15

docker exec django-prod conda run --no-capture-output -n teleRehabApp python manage.py migrate
docker exec django-prod conda run --no-capture-output -n teleRehabApp python manage.py collectstatic --noinput
docker exec django-prod conda run --no-capture-output -n teleRehabApp python manage.py seed_admin
docker exec django-prod conda run --no-capture-output -n teleRehabApp python manage.py seed_feedback_questions
docker exec django-prod conda run --no-capture-output -n teleRehabApp python manage.py seed_periodic_tasks

docker network connect telereha-prod gateway 2>/dev/null || true
sed -i 's/nginx-localprod/nginx-prod/g' /home/ubuntu/repos/telerehabapp/nginx/gateway.nginx.conf
docker kill -s HUP gateway
docker kill -s HUP nginx-prod
```

## Verification Checklist After Deploy

```bash
# 1) Running container image tags
docker inspect react-prod --format '{{.Config.Image}}'
docker inspect django-prod --format '{{.Config.Image}}'

# 2) Compose service status
cd /home/ubuntu/repos/telerehabapp-prod
docker compose -f docker-compose.prod.reha-advisor.yml --env-file .env.prod ps

# 3) Health endpoint
curl -s -o /dev/null -w "%{http_code}\n" https://reha-advisor.ch/health

# 4) Backend migration command sanity check
docker exec django-prod conda run --no-capture-output -n teleRehabApp python manage.py showmigrations --plan | head -n 30
```

Frontend smoke-check:

- Open `https://reha-advisor.ch`
- Hard refresh (clear cache if needed)
- Validate expected release changes are visible

## Troubleshooting Decision Tree

### A) `manifest unknown`

Check in order:

1. Is `IMAGE_TAG` normalized (`X.Y.Z`)?
2. Do `${GHCR_IMAGE}-frontend:X.Y.Z` and `${GHCR_IMAGE}-backend:X.Y.Z` exist?
3. Is server `.env.prod` `GHCR_IMAGE` set to `ghcr.io/artorg-gerontechnology/bearny-rehaadvisor`?

### B) Checkout/fetch errors for release tag

Typical cause: tag does not exist remotely.

Checks:

```bash
git ls-remote --tags origin | rg "refs/tags/v0\\.3\\.1$"
```

### C) Deploy reports success but frontend unchanged

Typical causes:

- Wrong image namespace in `GHCR_IMAGE`
- Browser/service-worker cache
- Running tag mismatch

Checks:

```bash
docker inspect react-prod --format '{{.Config.Image}}'
```

### D) `ModuleNotFoundError: No module named 'django'` in post-deploy commands

Cause:

- `python manage.py ...` executed outside the Conda env.

Fix:

- Always run `conda run --no-capture-output -n teleRehabApp python manage.py ...`

## Rollback Caveats

- Workflow rollback uses previous git tag and exports `IMAGE_TAG="${PREV_TAG#v}"`.
- Rollback only works if matching GHCR images for previous normalized tag still exist.
- Gateway switch back to local-prod is part of rollback path in workflow.

## Related Files

- `.github/workflows/deploy-prod.yml`
- `docker-compose.prod.reha-advisor.yml`
- `docs/06-DEPLOYMENT_GUIDE.md`
- `docs/08-TROUBLESHOOTING.md`
- `docs/QUICK_REFERENCE.md`
