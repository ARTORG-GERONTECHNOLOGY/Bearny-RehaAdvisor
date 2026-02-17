// Runs only on first init (empty /data/db)
const adminUser = process.env.MONGO_INITDB_ROOT_USERNAME;
const adminPass = process.env.MONGO_INITDB_ROOT_PASSWORD;
const appDb = process.env.MONGO_APP_DB || "reha_advisor_dev";

if (!adminUser || !adminPass) {
  throw new Error("Missing MONGO_INITDB_ROOT_USERNAME or MONGO_INITDB_ROOT_PASSWORD");
}

db = db.getSiblingDB("admin");

db.createUser({
  user: adminUser,
  pwd: adminPass,
  roles: [{ role: "root", db: "admin" }],
});

// Create app DB + an initial collection (optional)
db = db.getSiblingDB(appDb);
db.createCollection("users");
