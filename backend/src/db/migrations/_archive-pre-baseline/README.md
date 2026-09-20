# Archived migrations (do not run)

These are the old migration files 0000-0032. They were applied to the live database by hand and their
Drizzle journal never listed more than two of them, so `npm run db:migrate` could not build a database.
They are kept only for history. The live schema is now captured in `../0000_baseline.sql`.
New schema changes: edit `src/db/schema/*.ts`, run `npm run db:generate`, review the SQL, and apply it.
