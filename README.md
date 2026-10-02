# Friends

Local-only PWA for staying connected with people who matter.

## Features

- **Google Contacts sync** - Import contacts via OAuth
- **Tagging system** - Classify contacts (inner-circle, friend, acquaintance, professional)
- **Configurable thresholds** - Set check-in frequency per tag (e.g., 2 friends/week)
- **Smart nudging** - Dashboard shows overdue contacts, prioritized by staleness
- **Check-in tracking** - Mark contacts as "reached out", set custom dates
- **Push notifications** - Daily reminder at configured time (default 4pm)
- **Offline support** - SQLite stored locally in browser

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project
3. Enable **People API**
4. Create OAuth 2.0 credentials (Web application)
5. Add `http://localhost:5173` to authorized JavaScript origins
6. Copy the Client ID

Create `.env` file:
```bash
cp .env.example .env
```

Edit `.env` and add your Google Client ID:
```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### 3. Add PWA icons (optional)

Add these files to `/public`:
- `pwa-192x192.png` (192x192px)
- `pwa-512x512.png` (512x512px)
- `apple-touch-icon.png` (180x180px)
- `favicon.ico`

### 4. Run the app
```bash
npm run dev
```

Open http://localhost:5173

## Usage

1. **Import contacts** - Go to sync page, connect Google account
2. **Tag contacts** - Open a contact, select a classification
3. **Configure thresholds** - Settings > Tags & Thresholds
4. **Enable notifications** - Settings > Enable Notifications
5. **Check in** - Dashboard shows due contacts, tap "Done" when you reach out

## Tech Stack

- React 18 + TypeScript
- Vite + vite-plugin-pwa
- Tanstack Query + Router
- shadcn/ui + Tailwind CSS
- sql.js (SQLite WASM)
- Google People API

## Data Storage

All data stored locally in browser IndexedDB. Nothing sent to any server.

### Backup and restore

Settings > Data has two actions:

- **Export data** downloads the whole database as `friends-backup-YYYY-MM-DD.sqlite`.
- **Restore** replaces all current data with a file exported earlier. It asks for confirmation,
  downloads a backup of the current data first, then swaps in the file. A file that is not a
  Friends export is rejected and nothing changes.
