# OlufunmilyoSMS desktop application in a browser

This uses the root `src/`, `public/`, and `electron/services.cjs` from the installed app. The nested `carlspat-sms-github/web` Next.js app is a separate product and is not this interface.

## Architecture and limits

The browser preserves the desktop screens and calls the desktop service operations through `src/browser-api.ts`. Electron continues using its existing preload bridge. The Node 22 API uses the built-in SQLite engine through `web-server/sqlite.cjs`, avoiding native Electron addons. The API in `web-server/` reuses the same school services and permission checks with an injected filesystem runtime.

This is a single-school pilot. The server stores a gzip archive of the SQLite database and school uploads in a private Supabase Postgres row under `desktop_web`. It holds a Postgres transaction/advisory lock while loading, executing, and committing each request. Requests are serialized across API instances; temporary Render disk is disposable. This is durable shared storage, not a normalized PostgreSQL conversion. Every request reloads/saves the archive, so throughput and memory usage limit this approach. Archives are capped at 128 MB uncompressed JSON, including base64 overhead. Browser uploads and backup imports are limited to 20 MB. Do not use this design for a large or multi-school production service.

The Postgres role must own the private schema/tables and bypass RLS (the project database owner does). Browser clients never receive the database credentials. No policy grants direct anon/authenticated access to the archive. User passwords remain in the server-side SQLite database with the desktop scrypt hashing scheme. A secret setup key is required in addition to the first administrator's chosen credentials. Stakeholder registration is disabled until the administrator exists.

## Deploy from the desktop repository

1. Push these changes to `carlspat/CarlspatSMSApp` after review. Do not use `carlspatlearning` remotes.
2. Create a separate Render Blueprint using `render-desktop.yaml` in that repository. It selects Free. Set the new Supabase `DATABASE_URL` and the exact browser site's origin as `CORS_ORIGIN`. Keep the generated `SETUP_KEY` private; enter it only at initial school setup.
3. Use a Vercel project linked to the desktop repository, root directory `./`, framework Vite. Install with `npm ci --ignore-scripts`, build with `npm run build`, output `dist`. This avoids downloading Electron for a browser build.
4. Set Vercel `VITE_SCHOOL_API_URL` to the new desktop API origin and rebuild. Do not point this frontend to the old `/api/v1` Next.js backend; its API contracts differ.
5. Check `/api/v1/health`, open the browser app, register the Super Admin with the private setup key, and verify school workflows before replacing the existing website.

## Backups and data migration

Online backups download a `.smsbackup` archive containing the database and uploaded files. Restoring requires the existing administrator's backup permission, checks SQLite integrity, keeps a safety archive in `desktop_web.backup_history`, clears login sessions, and rebases asset paths. Backups contain private school information and password hashes; store them securely.

The online school starts empty. Existing desktop records and files are not imported automatically. The existing desktop mirror sync belongs to the separate API and does not integrate these two databases. The updated desktop build adds **Settings & backups → Export for online school**. This portable `.smsbackup` includes referenced logos, student photos and teaching materials and preserves existing account password hashes; it excludes active login sessions. Import it using Restore backup while signed in as the online administrator. Missing source files are reported by count. This requires a newly built desktop installer; existing installed versions do not have the new export action. Two-way desktop synchronization, automatic scheduled backup execution/retention, and a normalized Postgres migration remain outstanding. Do not claim existing desktop records are synchronized.

## Validation

Run `npm run build` for the shared interface and `node --test web-server/test/*.test.cjs` for archive tests. Full API verification must include setup, session expiry, parent/student/stakeholder boundaries, fees, results, uploads, concurrent edits and restart recovery with a test database. Cloud deployment has not been performed by these local changes.
