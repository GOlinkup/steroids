# Netlify Serverless Functions

This directory contains serverless functions that are automatically deployed to Netlify.

## Functions

### submit-feedback.js

This function handles the submission of user feedback from the feedback form.

#### Features:
- Email notification to admin when feedback is submitted
- Confirmation email to user
- Input validation and sanitization
- Rate limiting to prevent abuse
- CSRF protection

#### Environment Variables:

Set these in your Netlify dashboard under Site settings > Build & deploy > Environment:

```
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password
ADMIN_EMAIL=admin@example.com
SEND_EMAILS_IN_DEV=false  # Set to 'true' to send actual emails in development mode
```

## Local Development

To test functions locally, install the Netlify CLI:

```bash
npm install -g netlify-cli
```

Then run:

```bash
netlify dev
```

This will start a local development server that simulates the Netlify Functions environment.

## Deployment

Functions are automatically deployed when you push to your repository. The `netlify.toml` file in the root directory configures the functions directory.

## Security Considerations

- All user inputs are sanitized to prevent injection attacks
- Rate limiting is implemented to prevent abuse
- Environment variables are used for sensitive information
- CSRF protection is implemented
