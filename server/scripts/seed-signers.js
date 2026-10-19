// Development only: creates (or resets) one account for each signer role plus a loan officer,
// all with the same password, so the approval chain can be tried end to end.
//   npm --prefix server run seed:signers
require("dotenv").config({ quiet: true }); // so NODE_ENV set in .env counts too
if (process.env.NODE_ENV === "production") {
  console.error("seed:signers is for development only and refuses to run when NODE_ENV=production.");
  process.exit(1);
}

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { connectDb } = require("../src/config/db");
const User = require("../src/models/User");

const PASSWORD = "Signer2026";

const accounts = [
  { role: "loan_officer", fullName: "Lorna Dizon", email: "loan.officer@uedi.local" },
  { role: "bookkeeper", fullName: "Benjie Bautista", email: "bookkeeper@uedi.local" },
  { role: "treasurer", fullName: "Teresa Lim", email: "treasurer@uedi.local" },
  { role: "crecom_chair", fullName: "Carlos Mercado", email: "crecom@uedi.local" },
  { role: "president", fullName: "Perla Villanueva", email: "president@uedi.local" },
];

async function main() {
  await connectDb();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  for (const a of accounts) {
    await User.findOneAndUpdate(
      { email: a.email },
      { $set: { fullName: a.fullName, role: a.role, passwordHash } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }
  console.log("\nSigner accounts (created or reset):\n");
  for (const a of accounts) console.log(`  ${a.role.padEnd(13)} ${a.email.padEnd(26)} ${a.fullName}`);
  console.log(`\nPassword for all of them: ${PASSWORD}\n`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
