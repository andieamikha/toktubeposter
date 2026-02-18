/**
 * Reset Admin Password Script
 * 
 * Usage: node reset-admin.js
 * 
 * Resets admin@tiktokmanager.com password to Admin123!
 */

const path = require('path');
const fs = require('fs');

async function main() {
  const dbPath = path.join(__dirname, 'backend', 'data', 'tiktok_manager.db');
  
  // Check database exists
  if (!fs.existsSync(dbPath)) {
    console.log('[ERROR] Database not found at:', dbPath);
    console.log('');
    console.log('Start the backend first to create the database:');
    console.log('  start.bat');
    process.exit(1);
  }

  // Load dependencies from backend's node_modules
  const bcrypt = require(path.join(__dirname, 'backend', 'node_modules', 'bcryptjs'));
  const initSqlJs = require(path.join(__dirname, 'backend', 'node_modules', 'sql.js'));
  
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  const email = 'admin@tiktokmanager.com';
  const password = 'Admin123!';
  const hash = await bcrypt.hash(password, 12);

  // Check if admin exists
  const rows = db.exec("SELECT id, email, is_active FROM users WHERE email = '" + email + "'");

  if (rows.length === 0 || rows[0].values.length === 0) {
    // Admin doesn't exist, create it
    const crypto = require('crypto');
    const id = crypto.randomUUID();
    db.run(
      "INSERT INTO users (id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      [id, email, hash, 'Administrator', 'admin', 1]
    );
    console.log('[OK] Admin account CREATED.');
  } else {
    // Admin exists, reset password and activate
    db.run(
      "UPDATE users SET password_hash = ?, is_active = 1 WHERE email = ?",
      [hash, email]
    );
    console.log('[OK] Admin password RESET and account activated.');
  }

  // Save database
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  db.close();

  console.log('');
  console.log('You can now login with:');
  console.log('  Email    :', email);
  console.log('  Password :', password);
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
