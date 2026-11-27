// Web and mobile sign-ups now make the same kind of account: role "staff" (shown as Member), which
// sees only its own records. Older mobile sign-ups have role "member"; this lists them, and with
// --apply changes them to "staff". Office roles are not touched.
//   node scripts/migrate-signup-roles.js            (dry run: prints what would change)
//   node scripts/migrate-signup-roles.js --apply    (writes)
// A database that isn't on this computer also needs --yes.
const mongoose = require("mongoose");
const { connectDb } = require("../src/config/db");
const User = require("../src/models/User");
const AuditLog = require("../src/models/AuditLog");

const apply = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGODB_URI || "";
  if (apply && !/localhost|127\.0\.0\.1/.test(uri) && !process.argv.includes("--yes")) {
    console.error("MONGODB_URI is not a database on this computer. Add --yes to really change it.");
    process.exit(1);
  }
  await connectDb();
  const users = await User.find({ role: "member" }).select("fullName email memberId role createdAt").sort({ createdAt: 1 }).lean();
  if (!users.length) {
    console.log("Nothing to change: no account has the old mobile role \"member\".");
    return;
  }
  console.log(`${users.length} account(s) would change from "member" to "staff" (Member):\n`);
  for (const u of users) console.log(`  ${u.email.padEnd(32)} ${u.fullName.padEnd(28)} ${u.memberId || "(no member ID)"}`);
  if (!apply) {
    console.log("\nDry run: nothing was written. Run again with --apply to change them.");
    return;
  }
  const r = await User.updateMany({ _id: { $in: users.map((u) => u._id) }, role: "member" }, { $set: { role: "staff" } });
  await AuditLog.create({
    userName: "System",
    role: "system",
    action: "Sign-up roles migrated",
    target: `${r.modifiedCount} account(s): member → staff`,
    method: "SCRIPT",
    path: "scripts/migrate-signup-roles.js",
    details: { emails: users.map((u) => u.email) },
    status: 200,
    ok: true,
  });
  console.log(`\nChanged ${r.modifiedCount} account(s) to "staff".`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
