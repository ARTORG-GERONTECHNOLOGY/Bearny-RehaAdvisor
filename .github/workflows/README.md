# GitHub Actions CI/CD Workflows

This document describes all GitHub Actions workflows configured for the RehaAdvisor project.

## Overview

Four comprehensive workflows are configured for continuous integration and deployment:

1. **Tests** - Run unit and integration tests on every push
2. **Security** - Scan for vulnerabilities and code quality issues
3. **Code Quality** - Analyze code metrics and enforce standards
4. **Production Deployment** - Deploy to staging and production

---

## 1. Tests Workflow (`tests.yml`)

### Trigger
- **On Push:** main, develop branches (modified frontend/backend/tests.yml)
- **On Pull Request:** main, develop branches
- **Manual:** Can be triggered from Actions tab

### Jobs

#### Frontend Tests (Jest)
- **Node.js:** 18.x
- **Cache:** npm dependencies
- **Steps:**
  1. Install dependencies
  2. Lint code (ESLint)
  3. Run tests with coverage
  4. Upload to Codecov

**Timeout:** 30 minutes

#### Backend Tests (Pytest)
- **Python:** 3.10
- **Services:** MongoDB 8.0, Redis 7
- **Database:** Auto-authenticated MongoDB
- **Steps:**
  1. Install dependencies
  2. Run flake8 linting
  3. Execute pytest with coverage
  4. Upload to Codecov

**Timeout:** 30 minutes

#### Frontend E2E (Playwright)
- **Node.js:** 18.x
- **Python:** 3.10 (starts Django backend for FE↔BE E2E)
- **Services:** MongoDB 8.0, Redis 7
- **Steps:**
  1. Install backend dependencies and start Django on `127.0.0.1:8001`
  2. Install frontend dependencies
  3. Install Playwright Chromium
  4. Run base login E2E test (`home-login.spec.ts`)
  5. Run seeded redirect E2E tests when secrets are configured

**Timeout:** 40 minutes

Artifacts:
- `playwright-e2e-artifacts` (uploaded on every run)
  - `frontend/playwright-report`
  - `frontend/test-results`
  - `/tmp/django-e2e.log`

#### Docker Build Check
- **Depends on:** Frontend & Backend tests pass
- **Steps:**
  1. Build frontend image (multi-stage)
  2. Build backend image
  3. Cache images in GitHub Actions registry

**Timeout:** 45 minutes

#### Security Scanning
- **Tool:** Trivy vulnerability scanner
- **Scope:** Filesystem scan for all dependencies
- **Output:** SARIF format uploaded to GitHub Security

**Timeout:** 30 minutes

### Environment Variables

```yaml
DB_HOST: localhost
DB_PORT: '27017'
DB_NAME: reha_advisor_test
MONGO_TLS: 'false'
DISABLE_MONGO_CONNECT: '1'
REDIS_URL: redis://localhost:6379/0
SECRET_KEY: test-secret-key-for-ci-cd
DEBUG: 'False'
```

### Optional E2E Secrets (recommended)

Configure these in **GitHub repository settings -> Secrets and variables -> Actions**:

- `E2E_PATIENT_LOGIN`
- `E2E_PATIENT_PASSWORD`
- `E2E_ADMIN_LOGIN`
- `E2E_ADMIN_PASSWORD`
- `E2E_THERAPIST_LOGIN` (optional, enables therapist 2FA login E2E)
- `E2E_THERAPIST_PASSWORD` (optional, enables therapist 2FA login E2E)

If these secrets are missing, only the base login E2E test runs and seeded redirect tests are skipped.
With `E2E_PATIENT_LOGIN`/`E2E_PATIENT_PASSWORD`, patient-scoped E2E tests are also executed:
- `e2e/patient-page.spec.ts`
- `e2e/patient-interventions-page.spec.ts`

### Artifacts

- Frontend coverage reports
- Backend coverage reports
- Security scan results (SARIF format)

---

## 2. Security Workflow (`security.yml`)

### Trigger
- **On Push:** main, develop branches
- **On Pull Request:** main, develop branches
- **Scheduled:** Daily at 2 AM UTC

### Jobs

#### Dependency Check
- **Python:** pip-audit, safety, bandit
- **Node:** npm audit
- **Outputs:**
  - `safety-report.json`
  - `bandit-report.json`
  - npm audit results

#### Code Analysis
- **Python:** pylint, flake8, black, isort
- **JavaScript:** ESLint
- **Checks:**
  - Code style compliance
  - Import ordering
  - Format validation

#### SAST Scan
- **Tool:** Trivy filesystem scan
- **Format:** SARIF
- **Scope:** Entire repository
- **Upload:** GitHub Security tab

#### Docker Security Scan
- **Trigger:** On main branch push only
- **Steps:**
  1. Build frontend image
  2. Scan with Trivy
  3. Build backend image
  4. Scan with Trivy
  5. Upload SARIF results

#### Secret Scanning
- **Tool:** TruffleHog
- **Scope:** Full git history
- **Failure:** Exits with code 1 if verified secrets found
- **Output:** `secrets-report.json`

#### License Check
- **Python:** pip-licenses
- **Node:** license-checker
- **Outputs:**
  - `python-licenses.csv`
  - `node-licenses.json`

### Required Secrets

None required (uses GitHub token for dependency checks)

---

## 3. Code Quality Workflow (`code-quality.yml`)

### Trigger
- **On Push:** main, develop branches (modified code)
- **On Pull Request:** main, develop branches

### Jobs

#### SonarCloud Analysis
- **Tool:** SonarCloud
- **Scope:** Full repository with history
- **Coverage:** Frontend + Backend
- **Prerequisites:** SonarCloud project configured

**Required Secrets:**
- `SONAR_TOKEN` - SonarCloud token

#### Code Metrics
- **Tools:** radon (Python), cloc (JavaScript)
- **Metrics:**
  - Cyclomatic complexity
  - Maintainability index
  - Lines of code
- **Output:** GitHub Step Summary

#### Formatting Check
- **Python:**
  - Black (format check)
  - isort (import ordering)
- **JavaScript:**
  - Prettier (format check)
  - ESLint (linting)

#### Type Checking
- **Tool:** TypeScript compiler
- **Config:** `frontend/tsconfig.json`
- **Scope:** No emit (check only)

#### Component Tests
- **Framework:** Jest
- **Scope:** React components
- **Coverage:** Upload to Codecov

---

## 4. Production Deployment Workflow (`deploy-prod.yml`)

### Trigger

**Automatic (main branch):**
- On push with changes to: frontend, backend, nginx, docker-compose.prod.reha-advisor.yml

**Manual:**
- Via GitHub Actions "Run workflow" button
- Select environment: staging or production

**With commit message:**
- Include `[deploy-prod]` in commit message to deploy to production

### Environment Variables

```yaml
REGISTRY: ghcr.io  # GitHub Container Registry
IMAGE_NAME: ${{ github.repository }}
```

### Jobs

#### Test
- Runs full test suite before deployment
- **Timeout:** 30 minutes
- **Failure:** Blocks deployment

#### Build
- **Registry:** GitHub Container Registry (ghcr.io)
- **Images:**
  - `ghcr.io/artorg-gerontechnology/rehaadvisor-frontend`
  - `ghcr.io/artorg-gerontechnology/rehaadvisor-backend`
- **Tags:**
  - Latest (for main branch)
  - Branch name
  - Git SHA (short)
  - Semantic versioning (if applicable)
- **Cache:** GHA cache
- **Timeout:** 60 minutes

#### Deploy to Staging
- **Trigger:** On main branch push
- **Server:** Connects via SSH to staging server
- **Steps:**
  1. Pull latest code
  2. Stop current services
  3. Pull latest Docker images
  4. Start services
  5. Run migrations
  6. Collect static files
  7. Verify health
- **Health Check:** Polls HTTPS endpoint for 60 seconds
- **Environment:** https://staging.reha-advisor.ch

#### Deploy to Production
- **Trigger:** Manual workflow_dispatch OR commit with `[deploy-prod]`
- **Concurrency:** Single deployment at a time (queue subsequent deployments)
- **Server:** Connects via SSH to production server
- **Steps:**
  1. Verify production readiness
  2. Create database backup
  3. Backup to S3 (if configured)
  4. Pull latest code
  5. Pull Docker images
  6. Start new services (zero-downtime)
  7. Run migrations
  8. Collect static files
  9. Run health checks
  10. Verify database connectivity
  11. Notify on success/failure
- **Rollback:** Automatic on failure
- **Health Check:** Polls endpoint for 120 seconds
- **Environment:** https://reha-advisor.ch

#### Notifications
- **Success:** Slack notification with deployment details
- **Failure:** Automatic rollback + Slack notification
- **GitHub:** Deployment status recorded

### Required Secrets

**Staging Deployment:**
```
STAGING_HOST           # IP or hostname
STAGING_USERNAME       # SSH username
STAGING_SSH_KEY        # Private SSH key
```

**Production Deployment:**
```
PROD_HOST              # IP or hostname
PROD_USERNAME          # SSH username
PROD_SSH_KEY           # Private SSH key
AWS_S3_BUCKET          # (Optional) S3 bucket for backups
```

**Notifications:**
```
SLACK_WEBHOOK_URL      # (Optional) Slack webhook for notifications
```

---

## Setup Instructions

### 1. GitHub Secrets Configuration

Navigate to Settings → Secrets and Variables → Actions

**Add these secrets:**

```bash
# Staging
STAGING_HOST=staging.your-domain.com
STAGING_USERNAME=deploy
STAGING_SSH_KEY=<contents of private key>

# Production
PROD_HOST=prod.your-domain.com
PROD_USERNAME=deploy
PROD_SSH_KEY=<contents of private key>

# Optional
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
AWS_S3_BUCKET=your-backup-bucket
SONAR_TOKEN=<sonarcloud-token>
```

### 2. Server Setup (Staging & Production)

On deployment servers, prepare:

```bash
# Create deployment directory
mkdir -p /opt/reha-advisor-staging  # or /opt/reha-advisor
cd /opt/reha-advisor-staging

# Clone repository
git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git .

# Setup SSH key for GitHub
ssh-keygen -t ed25519 -C "deployment@reha-advisor"
# Add public key to GitHub Deploy Keys

# Configure Docker to allow non-root access
sudo usermod -aG docker <username>

# Grant sudo access for docker compose (if needed)
sudo visudo
# Add: username ALL=(ALL) NOPASSWD: /usr/bin/docker compose
```

### 3. SonarCloud Setup (Optional)

1. Sign up at https://sonarcloud.io
2. Import GitHub repository
3. Generate token
4. Add as GitHub Secret: `SONAR_TOKEN`

### 4. Slack Integration (Optional)

1. Create Slack App: https://api.slack.com/apps
2. Enable Incoming Webhooks
3. Create webhook for deployment notifications
4. Add as GitHub Secret: `SLACK_WEBHOOK_URL`

---

## Workflow Execution Flow

### On Push to main:

```
1. Tests (Frontend + Backend + Docker Build + Security)
   ↓
2. Code Quality (SonarCloud + Metrics + Formatting)
   ↓
3. Security (Dependencies + Code Analysis + SAST)
   ↓
4. Deploy to Staging (if all pass)
   ↓
5. Notify (Slack + GitHub)
```

### On Manual Trigger with [deploy-prod]:

```
1. Tests
   ↓
2. Build Docker Images
   ↓
3. Deploy to Staging (automatic)
   ↓
4. Deploy to Production (manual confirmation)
   ↓
5. Verify Health & Database
   ↓
6. Notify (Slack + GitHub)
```

---

## Monitoring

### Check Workflow Status

1. Go to **Actions** tab in GitHub
2. Click on workflow name
3. View recent runs
4. Click run to see detailed logs

### Real-time Logs

In workflow run page:
- Click on job name
- Scroll through steps and logs
- View artifacts (test reports, coverage)

### Workflow Badges

Add to README.md:

```markdown
[![Tests](https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor/actions/workflows/tests.yml/badge.svg)](https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor/actions/workflows/tests.yml)
[![Security](https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor/actions/workflows/security.yml/badge.svg)](https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor/actions/workflows/security.yml)
[![Code Quality](https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor/actions/workflows/code-quality.yml/badge.svg)](https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor/actions/workflows/code-quality.yml)
[![Deploy Production](https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor/actions/workflows/deploy-prod.yml/badge.svg)](https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor/actions/workflows/deploy-prod.yml)
```

---

## Troubleshooting

### Tests Failing

1. Check logs: Click on failed job
2. Review error messages
3. Run locally: `make prod_up && make prod_migrate`
4. Check database services in logs

### Build Failing

1. Check Docker build output
2. Verify Dockerfile syntax
3. Check dependencies installed
4. View full logs for error details

### Deployment Failing

1. Check SSH connectivity to server
2. Verify secrets are correct
3. Check server disk space: `df -h`
4. Review server logs: `make prod_logs`
5. Rollback: Manual git checkout on server

### Health Check Timeout

1. Check service status on server: `make prod_health`
2. View logs: `make prod_logs`
3. Check database: `docker exec db-prod mongosh --eval 'db.adminCommand("ping")'`
4. Manual restart: `make prod_restart`

---

## Best Practices

1. **Branch Protection:** Require checks to pass before merge
2. **Commit Messages:** Use `[deploy-prod]` tag for production deployments
3. **Manual Approval:** Use manual trigger for critical deployments
4. **Monitoring:** Enable Slack notifications for awareness
5. **Backup:** Automatic backup created before each deployment
6. **Rollback:** Know how to rollback via git/docker if needed
7. **Testing:** Always run full test suite before production
8. **Documentation:** Keep secrets documentation updated

---

## Quick Reference

| Workflow | Trigger | Duration | Purpose |
|----------|---------|----------|---------|
| Tests | Push/PR | 5 min | Unit & integration tests |
| Security | Push/PR/Scheduled | 10 min | Vulnerability scanning |
| Code Quality | Push/PR | 10 min | Code analysis & metrics |
| Deploy Prod | Manual/Commit tag | 15 min | Production deployment |

---

**Version:** 1.0
**Last Updated:** February 17, 2024
**Status:** ✅ Production Ready
