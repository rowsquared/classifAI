# Quick Setup Instructions

## ⚠️ IMPORTANT: Environment Variables Required

The application won't run without a properly configured `.env` file.

### 1. Create `.env` file in project root:

```bash
cd /Users/andreas/projects/hitlann
touch .env
```

### 2. Add the following content to `.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hitlann?schema=public"

# NextAuth (REQUIRED!)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here-replace-me"

# Default Admin User
DEFAULT_ADMIN_EMAIL="admin@hitlann.local"
DEFAULT_ADMIN_PASSWORD="ChangeMe123!"
DEFAULT_ADMIN_NAME="System Administrator"
```

### 3. Generate a secure NEXTAUTH_SECRET:

```bash
openssl rand -base64 32
```

Copy the output and replace `your-secret-here-replace-me` in your `.env` file.

### 4. Restart the dev server:

```bash
# Kill the current server (Ctrl+C)
# Then restart:
pnpm dev
```

---

## Current Errors Explained:

### Error 1: MissingSecret
```
[auth][error] MissingSecret: Please define a `secret`
```
**Fix**: Add `NEXTAUTH_SECRET` to your `.env` file (see step 2-3 above)

### Error 2: Unknown argument `importOrder`
```
Unknown argument `importOrder`. Available options are marked with ?.
```
**Fix**: This should be resolved after `npx prisma generate` was run. Restart the dev server.

---

## Quick Start After Setup:

1. **First time only** - Initialize admin user:
   ```bash
   npx tsx scripts/init-admin.ts
   ```

2. **Start development server**:
   ```bash
   pnpm dev
   ```

3. **Open browser**:
   Navigate to `http://localhost:3000`

4. **Login**:
   - Email: (from `DEFAULT_ADMIN_EMAIL` in `.env`)
   - Password: (from `DEFAULT_ADMIN_PASSWORD` in `.env`)

5. **Reset password** (required on first login)

6. **You're in!** 🎉

---

## Troubleshooting:

### "Internal Server Error" on homepage
- Check that `.env` file exists and has all required variables
- Verify `NEXTAUTH_SECRET` is set
- Restart the dev server

### "Unauthorized" errors
- Make sure you've logged in
- Check that session cookie is being set (check browser dev tools)

### Database errors
- Ensure PostgreSQL is running
- Verify `DATABASE_URL` in `.env` is correct
- Run `npx prisma migrate dev` if needed

### Module not found errors
- Run `pnpm install` to ensure all dependencies are installed
- Run `npx prisma generate` to regenerate Prisma Client
- Delete `.next` folder and restart: `rm -rf .next && pnpm dev`

---

## Need Help?

See the detailed documentation:
- `ENV_SETUP.md` - Environment configuration
- `COMPLETE_AUTH_SYSTEM_SUMMARY.md` - Full system overview
- `TEAM_MANAGEMENT_SUMMARY.md` - User management guide

