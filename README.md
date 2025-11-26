# Hitlann - AI-Assisted Labeling Tool

A modern, responsive web application for hierarchical data labeling with optional AI pre-classification support.

## Features

- **Multi-level Taxonomy Management**: Import and manage hierarchical taxonomies up to 5 levels deep
- **Sentence Labeling Interface**: Split-view interface with intuitive navigation and search
- **AI Pre-classification Support**: Optional AI predictions with confidence scores
- **User Management**: Role-based access control (Admin, Supervisor, Labeller)
- **Progress Tracking**: Detailed metrics and performance analytics
- **Batch Operations**: Bulk labeling, assignment, and editing
- **Comments & Flags**: Add context and mark items for review
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Dark/Light Mode**: System-aware theming

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js v5
- **State Management**: Zustand, TanStack Query
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+ (using pnpm package manager)
- PostgreSQL 12+ database

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/hitlann.git
cd hitlann
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials and secrets. See [ENV_SETUP.md](./ENV_SETUP.md) for detailed configuration.

**Required variables:**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/hitlann"
NEXTAUTH_SECRET="your-secret-here"  # Generate with: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
DEFAULT_ADMIN_EMAIL="admin@example.com"
DEFAULT_ADMIN_PASSWORD="change-this-immediately"
```

4. Set up the database:
```bash
# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# (Optional) Create initial admin user if not auto-created
npx tsx scripts/init-admin.ts
```

5. Start the development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Initial Login

The default admin user is created automatically on first run using the `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` from your `.env` file.

**Important:** Change the password immediately after first login!

## Production Deployment

### Build for Production

```bash
# Install dependencies
pnpm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Build the application
pnpm build
```

### Environment Variables for Production

Ensure all environment variables are set in your production environment:

- **DATABASE_URL**: Production PostgreSQL connection string
- **NEXTAUTH_URL**: Your production domain (e.g., `https://yourdomain.com`)
- **NEXTAUTH_SECRET**: Strong random secret (generate with `openssl rand -base64 32`)
- **DEFAULT_ADMIN_EMAIL**: Admin email (change password after first login)
- **DEFAULT_ADMIN_PASSWORD**: Strong initial password
- **AI_LABELING_API_URL**: (Optional) External AI service URL
- **AI_LABELING_API_KEY**: (Optional) API key for AI service

### Running in Production

```bash
pnpm start
```

### Deployment Platforms

#### Vercel

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Configure build command: `pnpm build`
4. Configure output directory: `.next`
5. Add PostgreSQL database (Vercel Postgres or external)

#### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate
EXPOSE 3000
CMD ["pnpm", "start"]
```

### Security Checklist

- [ ] Change `NEXTAUTH_SECRET` to a strong random value
- [ ] Change `DEFAULT_ADMIN_PASSWORD` to a strong password
- [ ] Use strong database credentials
- [ ] Enable HTTPS in production
- [ ] Set secure cookie settings (handled by NextAuth in production)
- [ ] Review and restrict CORS if needed
- [ ] Set up database backups
- [ ] Configure rate limiting (consider adding middleware)
- [ ] Review file upload limits for CSV imports

## Project Structure

```
hitlann/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── admin/             # Admin pages (taxonomy, sentences, export, team)
│   ├── progress/          # Progress tracking page
│   ├── queue/             # Sentence queue and labeling interface
│   └── login/             # Authentication
├── components/            # React components
├── lib/                   # Utilities and configurations
├── prisma/               # Database schema and migrations
├── public/               # Static assets
├── scripts/              # Database and setup scripts
└── styles/               # Global styles
```

## Key Features

### Taxonomy Management
- Import CSV files with hierarchical taxonomy structure
- Support for up to 3 active taxonomies
- Custom level names (e.g., "Major", "Minor", "Unit Group")
- Soft delete and restore functionality

### Labeling Interface
- Real-time search across all taxonomy levels
- Breadcrumb navigation with clickable chips
- Keyboard shortcuts for efficiency
- Flag and comment support
- Unknown label option

### User Management
- Role-based permissions (Admin, Supervisor, Labeller)
- Hierarchical supervision structure
- Sentence assignment workflow
- Password reset functionality

### Progress Analytics
- Completion rate tracking
- AI agreement metrics
- Time to label (median)
- Unknown rate by level
- Daily activity charts
- Team performance dashboard (for supervisors)

## Documentation

- [Setup Instructions](./SETUP_INSTRUCTIONS.md)
- [Authentication System](./AUTH_IMPLEMENTATION_SUMMARY.md)
- [Team Management](./TEAM_MANAGEMENT_SUMMARY.md)
- [Environment Setup](./ENV_SETUP.md)

## Contributing

This is a private project. Contact the maintainers for access.

## License

Private - All Rights Reserved

## Support

For issues or questions, please contact the development team.

