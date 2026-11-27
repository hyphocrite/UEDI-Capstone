const env = require("./config/env");
const { connectDb } = require("./config/db");
const { createApp } = require("./app");
const settings = require("./services/settings");
const conversions = require("./services/conversions");

async function main() {
  await connectDb();
  // One-time fix to saved Settings (short term is 5 months now), then the short-term check.
  if (await settings.migrate()) console.log("Settings: short term is now 1 to 5 months (it was the untouched default of 6).");
  const converted = await conversions.convertOverdueShortTerm().catch((err) => (console.error("Short-term conversion failed:", err.message), []));
  if (converted.length) console.log(`Converted ${converted.length} short-term mutual assistance to long term.`);
  conversions.scheduleDaily();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`UDEI API listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
