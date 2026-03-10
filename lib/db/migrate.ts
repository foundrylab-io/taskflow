// Migration runner — auto-discovers all .sql files in migrations/
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error('POSTGRES_URL not set');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function migrate() {
  const migrationFile = join(__dirname, 'migrations', '0000_soft_the_anarchist.sql');
  const migrationSQL = readFileSync(migrationFile, 'utf-8');

  // Split on --> statement-breakpoint and execute each statement
  const statements = migrationSQL
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Running ${statements.length} migration statements...`);

  for (let i = 0; i < statements.length; i++) {
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    try {
      await sql.unsafe(statements[i]);
      console.log(`  ✓ Statement ${i + 1} succeeded`);
    } catch (err: any) {
      // Ignore "already exists" errors for idempotency
      if (err.message?.includes('already exists')) {
        console.log(`  ⚠ Statement ${i + 1} skipped (already exists)`);
      } else {
        console.error(`  ✗ Statement ${i + 1} failed:`, err.message);
        throw err;
      }
    }
  }

  console.log('Migration complete!');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
