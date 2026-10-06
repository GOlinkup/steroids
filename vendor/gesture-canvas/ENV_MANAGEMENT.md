# Environment Variables Management

This document explains how to properly manage environment variables in this project.

## Why Environment Variables Should Not Be Committed

Environment variables often contain sensitive information such as:
- API keys
- Database credentials
- Email passwords
- Service tokens
- Other secrets

Committing these to version control creates security risks:
1. Anyone with access to the repository can see the secrets
2. Secrets can be exposed in public repositories
3. Secrets remain in the git history even if removed later
4. Different environments (development, staging, production) need different values

## How to Manage Environment Variables

### Local Development

1. Use `.env.example` as a template
   - This file contains the structure but with placeholder values
   - It should be committed to the repository

2. Create your local `.env` file
   ```bash
   cp .env.example .env
   ```

3. Edit your `.env` file with your actual values
   ```bash
   nano .env  # or use any text editor
   ```

4. The `.env` file is now in `.gitignore` and won't be committed

### Removing .env from Git Tracking

If you've already committed `.env` files to the repository, you can use the provided script to remove them from tracking:

```bash
./remove-env-from-git.sh
```

This script will:
- Create backups of your current `.env` files
- Remove them from git tracking without deleting the local files
- Provide instructions for committing the changes

### Environment Variables for Different Environments

For different environments, you can create specific files:
- `.env.development` - Development environment
- `.env.test` - Testing environment
- `.env.production` - Production environment

These are all ignored by git.

### Deployment

#### Netlify

For Netlify deployment, set environment variables in the Netlify dashboard:
1. Go to Site settings > Build & deploy > Environment
2. Add each variable from your `.env` file

#### GitHub Pages

For GitHub Pages or other static hosting:
1. Use GitHub Secrets for GitHub Actions workflows
2. Reference these secrets in your workflow files

## Current Environment Variables

The project uses these environment variables:

| Variable | Purpose | Example |
|----------|---------|---------|
| SMTP_HOST | SMTP server for email | smtp.gmail.com |
| SMTP_PORT | SMTP port | 587 |
| SMTP_SECURE | Use TLS | false |
| SMTP_USER | SMTP username/email | your-email@example.com |
| SMTP_PASS | SMTP password | your-password |
| ADMIN_EMAIL | Email to receive feedback | admin@example.com |
| SEND_EMAILS_IN_DEV | Send emails in dev mode | true/false |

## Best Practices

1. Never commit real credentials to the repository
2. Regularly rotate secrets and credentials
3. Use different credentials for different environments
4. Limit access to production credentials
5. Consider using a secrets manager for production
