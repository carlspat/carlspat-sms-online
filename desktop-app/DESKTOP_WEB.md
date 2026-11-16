# OlufunmilayoSMS desktop application in a browser

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

## Bank instructions and payment receipts

Payment details shows both Sterling Bank accounts to parents and students, and the examination account only to stakeholders. Parents and stakeholders can upload PDF/PNG/JPG receipts up to 5 MB, linked to their own pupil or approved stakeholder school application. Hosts see and download submitted files under Payment details. Receipt uploads do not verify payment or change outstanding balances automatically. Receipt metadata is stored in SQLite and its files are included in the private cloud archive and portable backups.

## Cloudinary storage

Set `CLOUDINARY_CLOUD_NAME=ixqbuvsd`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` privately on the Render **desktop API** service. Credentials are never sent to browsers or saved in school backups. Use Cloudinary Console → Settings → API Keys to find them. These variables belong to Render, not Vercel. Check the product environment/cloud name before copying credentials.

When all three values are configured, new uploads use the official Cloudinary SDK and are stored as authenticated raw assets inside `olufunmilayo` categories. Raw storage preserves the original bytes for images, PDFs, Word files and other supported school documents. User-visible download/view operations retain the desktop service's permissions; the server then retrieves a short-lived signed Cloudinary download and verifies its SHA-256 checksum before returning the file. It does not issue public image/document URLs to browsers. Files and their derived formats are not publicly delivered. Cloudinary's current account file-size limits, delivery settings and usage quotas still apply; authenticated download requests consume provider bandwidth.

The school archive keeps immutable Cloudinary references, including the public ID, type, cloud name, size and checksum. Existing inline uploads remain intact until the host selects **Settings & backups → Cloudinary uploads → Migrate existing files to Cloudinary**. Migration first keeps a safety archive in Supabase, uploads files and verifies their bytes before committing cloud references. A failed migration rolls back the active archive so existing files remain available. Previously retained safety/backup archives are not deleted. Do not remove referenced Cloudinary assets: backups and past records can depend on them.

Online backup downloads materialize all referenced Cloudinary assets and include their original bytes, so a downloaded `.smsbackup` remains portable. This download can be slower for large schools and still has the pilot archive-size limit. Existing desktop installations keep offline files locally; their files can reach the online school through the portable export/import workflow and then be migrated. Direct background desktop-to-Cloudinary synchronization is not implemented.
