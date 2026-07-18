import pkg from 'pg';
const { Client } = pkg;

const TRIES = [
  // Gateway project via pooler with same password as tenant
  { user: 'postgres.sifzogcmljuabtkvrpcs', password: 'Abd.usman2002', host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543, label: 'gateway+tenant_password' },
  // Gateway project via pooler with service key as password
  { user: 'postgres.sifzogcmljuabtkvrpcs', password: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpZnpvZ2NtbGp1YWJ0a3ZycGNzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzcwODY3NSwiZXhwIjoyMDk5Mjg0Njc1fQ.2Ky9FY3OzHzIfhBLO3GFlmooBuzT_SRuUV46kyNfo0g', host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543, label: 'gateway+service_key' },
  // Try session mode (port 5432) 
  { user: 'postgres.sifzogcmljuabtkvrpcs', password: 'Abd.usman2002', host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 5432, label: 'gateway+tenant_password_session' },
  // Try with just postgres user 
  { user: 'postgres', password: 'Abd.usman2002', host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543, database: 'postgres.sifzogcmljuabtkvrpcs', label: 'postgres+tenant_password_custom_db' },
  // Try with project name
  { user: 'postgres', password: 'Abd.usman2002', host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543, database: 'sifzogcmljuabtkvrpcs', label: 'postgres+project_ref_db' },
];

for (const t of TRIES) {
  const client = new Client({
    host: t.host, port: t.port,
    user: t.user, password: t.password,
    database: t.database || 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    console.log(`${t.label}: CONNECTED`);
    await client.end();
  } catch (e) {
    console.log(`${t.label}: ${e.message}`);
    await client.end().catch(() => {});
  }
}
