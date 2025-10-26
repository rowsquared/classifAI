# Username Login Implementation

## Summary
Users can now login with either their **username** or **email address** (both work).

## Changes Made

### 1. Database Schema
- Added `username` field to the `User` model (required, unique)
- Existing admin user's username was automatically set from their email (part before @)

### 2. Authentication
- **Login page** (`app/login/page.tsx`):
  - Label changed from "Username" to "Username or Email"
  - Input type changed from `email` to `text` to accept both formats
  
- **Auth config** (`lib/auth.config.ts`):
  - Now searches for users by both `username` OR `email`
  - Accepts either value for login

### 3. User Management
- **Team page** (`app/admin/team/page.tsx`):
  - Added "Username" column to the users table (first column)
  - Added "Username" field to the Create User form (required, minimum 3 characters)
  - Username is now displayed with the password reset indicator

- **API** (`app/api/users/route.ts`):
  - Updated schema to require `username` field
  - Checks for both username and email uniqueness
  - Returns appropriate error messages for duplicate username or email
  - Includes `username` in all user queries

### 4. Admin Initialization
- **Init script** (`scripts/init-admin.ts`):
  - Now includes `DEFAULT_ADMIN_USERNAME` env variable (defaults to "admin")
  - Creates admin with username, email, and name
  - Checks for existing admin by both username and email

## Environment Variables
Add to your `.env` file:
```env
DEFAULT_ADMIN_USERNAME="admin"  # New variable
DEFAULT_ADMIN_EMAIL="admin@hitlann.local"
DEFAULT_ADMIN_PASSWORD="your-password-here"
DEFAULT_ADMIN_NAME="Admin"
```

## For Existing Users
The existing admin user now has username set to `admin` (extracted from their email).

## Testing
You can now login with:
- **Username**: `admin` + password
- **Email**: `admin@hitlann.local` + password

Both will work!

