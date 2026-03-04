/**
 * TRAFIQ Database Seeder
 * Run with:  npm run seed
 *
 * Creates default users for all roles. If a user already exists (by email),
 * it is skipped — so the script is safe to run multiple times.
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ── inline schema (no NestJS DI needed) ──────────────────────────────────────
const UserSchema = new mongoose.Schema(
  {
    email:               { type: String, required: true, unique: true },
    password:            { type: String, required: true },
    firstName:           { type: String, required: true },
    lastName:            { type: String, required: true },
    role:                { type: String, enum: ['admin', 'operator', 'authority', 'road_user'], default: 'road_user' },
    isVerified:          { type: Boolean, default: false },
    isActive:            { type: Boolean, default: true },
    verificationToken:   { type: String, default: null },
    resetPasswordToken:  { type: String, default: null },
    resetPasswordExpires:{ type: Date,   default: null },
  },
  { timestamps: true },
);

// ── seed data ─────────────────────────────────────────────────────────────────
const SEED_USERS = [
  {
    email:     'admin@trafiq.tn',
    password:  'Admin@1234',
    firstName: 'Super',
    lastName:  'Admin',
    role:      'admin',
    isVerified: true,
  },
  {
    email:     'operator@trafiq.tn',
    password:  'Operator@1234',
    firstName: 'Traffic',
    lastName:  'Operator',
    role:      'operator',
    isVerified: true,
  },
  {
    email:     'authority@trafiq.tn',
    password:  'Authority@1234',
    firstName: 'City',
    lastName:  'Authority',
    role:      'authority',
    isVerified: true,
  },
  {
    email:     'user@trafiq.tn',
    password:  'User@1234',
    firstName: 'Road',
    lastName:  'User',
    role:      'road_user',
    isVerified: true,
  },
];

// ── main ──────────────────────────────────────────────────────────────────────
async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trafiq_db';

  console.log(`\n🌱  Connecting to MongoDB: ${uri}`);
  await mongoose.connect(uri);
  console.log('✅  Connected\n');

  const User = mongoose.model('User', UserSchema);

  let created = 0;
  let skipped = 0;

  for (const userData of SEED_USERS) {
    const exists = await User.findOne({ email: userData.email });
    if (exists) {
      console.log(`⏭   Skipped  (already exists): ${userData.email}`);
      skipped++;
      continue;
    }

    const hashed = await bcrypt.hash(userData.password, 10);
    await User.create({ ...userData, password: hashed });
    console.log(`✔   Created  [${userData.role.padEnd(9)}] ${userData.email}  →  password: ${userData.password}`);
    created++;
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  Created : ${created}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`─────────────────────────────────────────`);
  console.log(`\n🔑  Admin login credentials:`);
  console.log(`    Email    : admin@trafiq.tn`);
  console.log(`    Password : Admin@1234`);
  console.log(`\n🚦  Run the server and open: http://localhost:3000/api/docs\n`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
