# Environment Setup

## Required Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hitlann?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-change-this-in-production"

# Default Admin User (created on first run if not exists)
DEFAULT_ADMIN_EMAIL="admin@hitlann.local"
DEFAULT_ADMIN_PASSWORD="change-this-password-immediately"
DEFAULT_ADMIN_NAME="System Administrator"

# AI Labeling Service (optional but required for AI features)
AI_LABELING_API_URL="https://your-ai-service.example.com"
AI_LABELING_API_KEY="your-ai-service-api-key"
AI_LABELING_BATCH_SIZE=100
AI_LEARNING_BATCH_SIZE=100
AI_LEARNING_MIN_NEW_ANNOTATIONS=500
```

## Generating a Secure Secret

For production, generate a secure `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

## Admin User Setup

The default admin user will be created automatically on first run if it doesn't exist.
**Important**: Change the password immediately after first login!

## Deployment

For production deployment:
1. Set strong passwords for both DATABASE and DEFAULT_ADMIN
2. Use environment variables or secrets management (not `.env` file)
3. Generate a new NEXTAUTH_SECRET
4. Set NEXTAUTH_URL to your production domain

