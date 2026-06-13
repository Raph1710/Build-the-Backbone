const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const hash = await bcrypt.hash('password123', 10);
  console.log('Hash:', hash);
  const verify = await bcrypt.compare('password123', hash);
  console.log('Verify:', verify);
  await pool.query(
    `INSERT INTO users (name, email, password) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password`,
    ['Seed User', 'seed@quickbite.com', hash]
  );
  console.log('User upserted');
  await pool.end();
}

main().catch(console.error);
