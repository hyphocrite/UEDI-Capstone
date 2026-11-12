const dns = require("node:dns");
const mongoose = require("mongoose");
const env = require("./env");

async function connectDb(uri = env.mongoUri) {
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(uri);
  } catch (err) {
    // Atlas "mongodb+srv://" addresses need a DNS SRV lookup, which some home routers and Windows
    // setups refuse. Retry once through public DNS servers.
    if (err?.syscall !== "querySrv") throw err;
    console.warn("This network's DNS could not look up the Atlas address; retrying with public DNS.");
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
    await mongoose.connect(uri);
  }
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

module.exports = { connectDb };
