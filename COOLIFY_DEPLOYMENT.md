# Coolify Deployment Guide

This guide will help you deploy the HitLANN application on Coolify.

## Prerequisites

- A Coolify instance (self-hosted or cloud)
- Git repository access

## Deployment Methods

There are two ways to deploy this application in Coolify:

1. **Docker Compose (Recommended)** - Includes PostgreSQL in the same deployment
2. **Dockerfile Only** - Requires separate PostgreSQL database

---

## Method 1: Docker Compose Deployment (Recommended)

This method deploys both the application and PostgreSQL database together using docker-compose.yml.

### 1. Create the Application

1. Navigate to **Projects** → **Add New Resource** → **Application**
2. Select your Git provider and repository
3. Configure build settings:
   - **Build Pack**: `nixpacks` or `dockerfile`
   - **Dockerfile Location**: `./Dockerfile` (if using Dockerfile)
   - **Port**: `3000`

### 3. Configure Environment Variables

Add the following environment variables in Coolify:

#### Required Variables

```env
# Database (use the internal connection string from step 1)
DATABASE_URL=postgresql://hitlann:your-password@hitlann-db:5432/hitlann?schema=public

# NextAuth Configuration
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-generated-secret-here

# Default Admin User
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=ChangeMe123!
DEFAULT_ADMIN_NAME=Admin User
```

#### Optional AI Labeling Variables

```env
# AI Labeling Service (if using)
AI_LABELING_API_URL=https://your-ai-service.example.com
AI_LABELING_API_KEY=your-api-key-here
AI_LABELING_BATCH_SIZE=100
AI_LEARNING_BATCH_SIZE=100
AI_LEARNING_MIN_NEW_ANNOTATIONS=500
AI_JOB_POLL_INTERVAL_MS=5000
AI_JOB_POLL_TIMEOUT_MS=600000
```

### 4. Generate NEXTAUTH_SECRET

Generate a secure secret for NextAuth:

```bash
openssl rand -base64 32
```

Use the output as your `NEXTAUTH_SECRET` value.

### 5. Configure Health Check (Optional)

In Coolify's health check settings:

- **Health Check Path**: `/api/health`
- **Health Check Port**: `3000`
- **Health Check Interval**: `30s`

### 6. Add Build Command (if using Nixpacks)

If Coolify is using Nixpacks instead of the Dockerfile, add these commands:

**Install Command**:
```bash
pnpm install --frozen-lockfile
```

**Build Command**:
```bash
pnpm build
```

**Start Command**:
```bash
sh -c "npx prisma migrate deploy && pnpm start"
```

### 7. Deploy

1. Click **Deploy** to start the deployment
2. Monitor the build logs
3. Once deployed, the database migrations will run automatically
4. Access your application at your configured domain

## Post-Deployment

### First Login

1. Navigate to your application URL
2. Login with the default admin credentials you set in `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`
3. **Important**: Change your password immediately after first login

### Database Migrations

Migrations run automatically on each deployment via the start command. If you need to run migrations manually:

```bash
npx prisma migrate deploy
```

### Verify Deployment

Check the health endpoint:
```bash
curl https://your-domain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-25T...",
  "database": "connected"
}
```

## Coolify-Specific Configuration

### Using Docker Compose in Coolify

Coolify also supports docker-compose deployments. If you prefer this method:

1. Select **Docker Compose** as deployment type
2. Point to the `docker-compose.yml` file in your repository
3. Configure environment variables as above
4. Deploy

### Database Backups

Enable automatic backups in Coolify:

1. Go to your PostgreSQL database settings
2. Navigate to **Backups**
3. Configure backup schedule and retention
4. Enable backups

### Scaling

To scale the application:

1. Go to your application settings
2. Adjust **Replicas** count (requires load balancer)
3. Note: Database connections may need adjustment for multiple instances

## Troubleshooting

### Build Fails

**Issue**: Prisma client generation fails
- **Solution**: Ensure `DATABASE_URL` is set during build time

**Issue**: pnpm not found
- **Solution**: Switch to Dockerfile deployment method

### Runtime Issues

**Issue**: Database connection fails
- **Solution**: Verify `DATABASE_URL` uses the correct internal hostname
- Check database is running and accessible

**Issue**: 503 errors on health check
- **Solution**: Check database connection string
- Verify migrations have run successfully
- Check application logs in Coolify

### Migration Issues

**Issue**: Migrations don't run
- **Solution**: Ensure start command includes `npx prisma migrate deploy`
- Check write permissions for Prisma

**Issue**: Migration fails with permissions error
- **Solution**: Verify database user has CREATE/ALTER permissions

## Environment-Specific Notes

### Production Recommendations

1. Use strong passwords for `NEXTAUTH_SECRET` and `DEFAULT_ADMIN_PASSWORD`
2. Change default admin password immediately after first login
3. Enable database backups
4. Configure SSL/TLS (handled by Coolify)
5. Set up monitoring and alerts
6. Review and adjust resource limits

### Persistent Storage

The application uses PostgreSQL for all persistent data. Ensure:

- Database volume is persisted in Coolify
- Regular backups are configured
- Backup retention meets your requirements

## Support

For issues specific to:
- **HitLANN application**: Check the main README.md
- **Coolify deployment**: Visit [Coolify Documentation](https://coolify.io/docs)
- **Prisma migrations**: Visit [Prisma Documentation](https://www.prisma.io/docs)

## Local Testing with Docker

Before deploying to Coolify, test locally:

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your values
nano .env

# Build and run
docker-compose up --build

# Access at http://localhost:3000
```

## Updating the Application

To update your deployment:

1. Push changes to your Git repository
2. Coolify will automatically rebuild (if auto-deploy is enabled)
3. Or manually trigger deployment in Coolify dashboard
4. Migrations run automatically on each deployment
