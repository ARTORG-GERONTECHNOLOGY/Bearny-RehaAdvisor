name: GitHub Actions Setup Guide

# GitHub Actions CI/CD Setup Guide

Complete guide to setting up GitHub Actions workflows for RehaAdvisor production deployment.

## Quick Setup (5 minutes)

### Step 1: Add GitHub Secrets

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"

**Add these secrets:**

```
STAGING_HOST=your-staging-server.com
STAGING_USERNAME=deploy
STAGING_SSH_KEY=<your-private-key>
PROD_HOST=reha-advisor.ch
PROD_USERNAME=deploy
PROD_SSH_KEY=<your-private-key>
```

### Step 2: Prepare Servers

```bash
# On your staging/production servers:

# 1. Create deployment user
sudo useradd -m -s /bin/bash deploy

# 2. Add SSH public key
mkdir -p /home/deploy/.ssh
echo "your-public-key" >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# 3. Create app directory
sudo mkdir -p /opt/reha-advisor
sudo chown deploy:deploy /opt/reha-advisor

# 4. Clone repository
cd /opt/reha-advisor
git clone https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git .

# 5. Setup Docker access for deploy user
sudo usermod -aG docker deploy
newgrp docker

# 6. Grant Docker Compose without password (optional)
sudo visudo
# Add line: deploy ALL=(ALL) NOPASSWD: /usr/bin/docker compose
```

### Step 3: First Deployment

Push to main branch with test code:

```bash
git push origin main
```

GitHub Actions will automatically:
1. ✅ Run all tests
2. ✅ Build Docker images
3. ✅ Deploy to staging
4. ✅ Send notifications

---

## Detailed Configuration

### SSH Key Setup

#### Generate SSH Key

```bash
# On your local machine
ssh-keygen -t ed25519 -C "reha-advisor-deploy" -f reha-advisor-deploy
# Press Enter twice (no passphrase)
```

#### Get Private Key for GitHub Secret

```bash
cat reha-advisor-deploy
# Copy entire content (including "-----BEGIN OPENSSH PRIVATE KEY-----")
```

#### Add Public Key to Servers

```bash
# Copy public key content
cat reha-advisor-deploy.pub

# SSH into server and add to authorized_keys
ssh deploy@your-server.com
mkdir -p ~/.ssh
echo "your-public-key-content" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
exit
```

#### Test SSH Connection

```bash
# This should connect without password prompt
ssh -i reha-advisor-deploy deploy@your-server.com "docker ps"
```

### GitHub Secrets Configuration

#### Required Secrets

| Secret | Value | Example |
|--------|-------|---------|
| `STAGING_HOST` | Staging server hostname/IP | `staging.reha-advisor.ch` |
| `STAGING_USERNAME` | SSH username | `deploy` |
| `STAGING_SSH_KEY` | Private SSH key (full PEM) | `-----BEGIN OPENSSH PRIVATE...` |
| `PROD_HOST` | Production server hostname/IP | `reha-advisor.ch` |
| `PROD_USERNAME` | SSH username | `deploy` |
| `PROD_SSH_KEY` | Private SSH key (full PEM) | `-----BEGIN OPENSSH PRIVATE...` |

#### Optional Secrets

| Secret | Purpose |
|--------|---------|
| `SLACK_WEBHOOK_URL` | Send deployment notifications to Slack |
| `AWS_S3_BUCKET` | Store database backups in S3 |
| `SONAR_TOKEN` | SonarCloud code quality analysis |

### Add Secrets via CLI

```bash
# Using GitHub CLI
gh secret set STAGING_HOST -b "staging.reha-advisor.ch"
gh secret set STAGING_USERNAME -b "deploy"
gh secret set STAGING_SSH_KEY < reha-advisor-deploy

gh secret set PROD_HOST -b "reha-advisor.ch"
gh secret set PROD_USERNAME -b "deploy"
gh secret set PROD_SSH_KEY < reha-advisor-deploy

# Optional
gh secret set SLACK_WEBHOOK_URL -b "https://hooks.slack.com/..."
```

---

## Environment-Specific Configuration

### Staging Environment

**File:** `.env.staging` (on server at `/opt/reha-advisor-staging/.env.prod`)

```bash
DEBUG=False
SECRET_KEY=your-staging-secret-key
ALLOWED_HOSTS=staging.reha-advisor.ch,staging.internal
MONGODB_URI=mongodb://admin:password@db-prod:27017/reha_advisor?authSource=admin
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=3600
```

### Production Environment

**File:** `.env.prod` (on server at `/opt/reha-advisor/.env.prod`)

```bash
DEBUG=False
SECRET_KEY=your-production-secret-key
ALLOWED_HOSTS=reha-advisor.ch,www.reha-advisor.ch
MONGODB_URI=mongodb://admin:password@db-prod:27017/reha_advisor?authSource=admin
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
```

---

## Slack Integration Setup

### Create Slack Webhook

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "RehaAdvisor CI/CD"
4. Select workspace
5. Go to "Incoming Webhooks"
6. Toggle "Activate Incoming Webhooks"
7. Click "Add New Webhook to Workspace"
8. Select channel: `#deployments`
9. Copy webhook URL

### Add to GitHub Secrets

```bash
gh secret set SLACK_WEBHOOK_URL -b "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

### Customize Notifications

Edit `.github/workflows/deploy-prod.yml` to customize Slack messages:

```yaml
- name: Send Slack notification
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: |
      🚀 Production Deployment
      Repository: ${{ github.repository }}
      Branch: ${{ github.ref }}
      Status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## SonarCloud Setup (Optional)

### Register Project

1. Go to https://sonarcloud.io
2. Sign in with GitHub
3. Click "Analyze your code"
4. Select your RehaAdvisor repository
5. Choose organization or create new

### Generate Token

1. Go to https://sonarcloud.io/account/security
2. Click "Generate Tokens"
3. Name: "RehaAdvisor GitHub Actions"
4. Generate

### Add to GitHub Secrets

```bash
gh secret set SONAR_TOKEN -b "your-sonar-token"
```

### Configure SonarCloud

Create `sonar-project.properties` in repository root:

```properties
sonar.projectKey=ARTORG-GERONTECHNOLOGY_RehaAdvisor
sonar.organization=your-org

# Frontend
sonar.sources=frontend/src,backend/api
sonar.tests=frontend/src,backend/tests
sonar.javascript.lcov.reportPaths=frontend/coverage/lcov.info
sonar.python.coverage.reportPath=backend/coverage.xml
```

---

## AWS S3 Backup Integration (Optional)

### Create S3 Bucket

```bash
aws s3 mb s3://reha-advisor-backups --region us-east-1
```

### Create IAM User for GitHub

1. Go to AWS IAM Console
2. Users → Create user
3. Name: `github-actions-reha-advisor`
4. Create access key
5. Attach policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::reha-advisor-backups",
        "arn:aws:s3:::reha-advisor-backups/*"
      ]
    }
  ]
}
```

### Add to GitHub Secrets

```bash
gh secret set AWS_S3_BUCKET -b "reha-advisor-backups"
gh secret set AWS_ACCESS_KEY_ID -b "your-access-key-id"
gh secret set AWS_SECRET_ACCESS_KEY -b "your-secret-access-key"
```

### Configure on Server

```bash
# Install AWS CLI
pip install awscli

# Configure credentials
aws configure
# Enter AWS Access Key ID
# Enter AWS Secret Access Key
# Enter region: us-east-1
```

---

## Workflow Customization

### Modify Test Triggers

Edit `.github/workflows/tests.yml`:

```yaml
on:
  push:
    branches: [main, develop]
    paths:
      - 'frontend/**'
      - 'backend/**'
      - '.github/workflows/tests.yml'  # Add/remove paths
```

### Modify Deployment Schedule

For automatic deployments at specific times:

```yaml
schedule:
  - cron: '0 2 * * *'  # Daily at 2 AM UTC
```

### Add Custom Build Steps

Edit `.github/workflows/deploy-prod.yml`:

```yaml
- name: Custom deployment step
  uses: appleboy/ssh-action@master
  with:
    host: ${{ secrets.PROD_HOST }}
    username: ${{ secrets.PROD_USERNAME }}
    key: ${{ secrets.PROD_SSH_KEY }}
    script: |
      cd /opt/reha-advisor
      # Your custom commands here
      ./scripts/backup.sh
      make prod_logs_django
```

---

## Troubleshooting

### SSH Connection Failed

**Error:** `Permission denied (publickey)`

**Solution:**
```bash
# Verify SSH key is correct
ssh -i reha-advisor-deploy deploy@your-server.com "echo 'SSH working'"

# Check GitHub secret has full key (including header/footer)
# Check server authorized_keys has public key
ssh deploy@your-server.com "cat ~/.ssh/authorized_keys"
```

### Deployment Hangs

**Error:** Workflow times out during deployment

**Solution:**
```bash
# SSH to server and check
ssh deploy@your-server.com
docker ps  # See running containers
docker logs django-prod  # Check service logs
make prod_health  # Run health check
```

### Tests Fail in GitHub but Pass Locally

**Cause:** Environment differences

**Solution:**
- Check GitHub Actions environment variables
- Verify service ports (MongoDB, Redis)
- Check Python/Node version mismatches
- Run same test command locally: `npm test -- --watchAll=false`

### Secrets Not Available in Workflow

**Error:** `${{ secrets.PROD_HOST }}` shows as empty

**Solution:**
```bash
# Verify secrets exist
gh secret list

# Re-add if missing
gh secret set PROD_HOST -b "your-value"

# Commit and push to trigger workflow again
```

### Docker Login Failed

**Error:** Failed to login to GitHub Container Registry

**Solution:**
- GitHub token is automatically available as `secrets.GITHUB_TOKEN`
- Verify repository permissions
- Manually push test: `docker login ghcr.io` and `docker push`

---

## Verification Checklist

Before first deployment:

- [ ] SSH keys generated and configured
- [ ] GitHub secrets added for all required variables
- [ ] Servers prepared (Docker, directories, permissions)
- [ ] SSH connection tested manually
- [ ] Environment files prepared on servers
- [ ] Test push to main branch successful
- [ ] All workflow jobs completed successfully
- [ ] Staging deployment successful
- [ ] Staging health checks passing
- [ ] Ready for production deployment

---

## Monitoring & Maintenance

### Check Workflow Status

```bash
# View all workflows
gh run list --workflow=tests.yml

# View specific run
gh run view <run-id>

# View logs
gh run view <run-id> --log
```

### Monitor in GitHub UI

1. Go to Actions tab
2. Click workflow name
3. View recent runs
4. Click run to see details

### Set Up Notifications

1. Watch repository (star + notifications)
2. Go to Settings → Notifications
3. Enable "Workflow runs"

### Maintain Workflows

- Review workflow logs weekly
- Check for deprecated Actions versions
- Update dependencies periodically
- Test manual deployments monthly
- Review and rotate SSH keys annually

---

## Security Best Practices

1. **SSH Keys:**
   - Rotate every 6 months
   - Never commit private keys
   - Use ed25519 keys (newer, better)

2. **Secrets:**
   - Rotate regularly
   - Never print in logs
   - Use environment-specific secrets

3. **Deployments:**
   - Require branch protection
   - Manual approval for production
   - Automatic backups before deploy

4. **Monitoring:**
   - Enable Slack notifications
   - Review deployment logs
   - Alert on failures

5. **Access Control:**
   - Limit repository contributors
   - Use deploy keys (not personal tokens)
   - Audit GitHub Actions usage

---

## Quick Reference

### GitHub CLI Setup

```bash
# Install GitHub CLI
# macOS: brew install gh
# Linux: https://github.com/cli/cli/blob/trunk/docs/install_linux.md
# Windows: choco install gh

# Login
gh auth login

# Set default repo
gh repo set-default ARTORG-GERONTECHNOLOGY/RehaAdvisor
```

### Useful Commands

```bash
# List secrets
gh secret list

# Add secret
gh secret set SECRET_NAME -b "value"

# Delete secret
gh secret delete SECRET_NAME

# List workflow runs
gh run list

# View run details
gh run view <run-id>

# View run logs
gh run view <run-id> --log

# Watch run in real-time
gh run watch <run-id>
```

---

## Support Resources

- **Workflow Documentation:** [.github/workflows/README.md](.github/workflows/README.md)
- **GitHub Actions Docs:** https://docs.github.com/en/actions
- **Deployment Guide:** [PRODUCTION_DEPLOYMENT.md](../../PRODUCTION_DEPLOYMENT.md)
- **Quick Start:** [QUICKSTART_PRODUCTION.md](../../QUICKSTART_PRODUCTION.md)

---

**Version:** 1.0
**Last Updated:** February 17, 2024
**Status:** ✅ Ready for Production
