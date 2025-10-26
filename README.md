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
- PostgreSQL database

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

Edit `.env` with your database credentials and secrets:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/hitlann"
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

4. Set up the database:
```bash
npx prisma migrate deploy
npx tsx scripts/init-admin.ts
```

5. Start the development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Initial Login

Default admin credentials:
- Email: `admin@example.com`
- Password: `admin123`

**Important:** Change the password immediately after first login!

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

