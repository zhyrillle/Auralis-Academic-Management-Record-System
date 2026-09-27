const bcrypt = require("bcryptjs");
const db = require("../config/db");

const SALT_ROUNDS = 10;

function isBcryptHash(str) {
  if (typeof str !== "string") return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
}

async function hashPassword(plainPassword) {
  if (!plainPassword) return "";
  if (isBcryptHash(plainPassword)) {
    return plainPassword;
  }
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword, storedPassword) {
  if (!plainPassword || !storedPassword) return false;

  if (isBcryptHash(storedPassword)) {
    return bcrypt.compare(plainPassword, storedPassword);
  }

  return plainPassword === storedPassword;
}

async function migratePlaintextPasswords() {
  try {
    const [users] = await db.execute(
      "SELECT user_id, email, password FROM `USER`"
    );

    let migratedCount = 0;
    for (const user of users) {
      if (user.password && !isBcryptHash(user.password)) {
        const hashed = await hashPassword(user.password);
        await db.execute(
          "UPDATE `USER` SET password = ? WHERE user_id = ?",
          [hashed, user.user_id]
        );
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      console.log(`Successfully migrated ${migratedCount} existing user password(s) to bcrypt hashes.`);
    } else {
      console.log("All user passwords in database are verified and encrypted with bcrypt.");
    }
  } catch (err) {
    console.error("Failed to migrate user passwords to bcrypt:", err);
  }
}

module.exports = {
  isBcryptHash,
  hashPassword,
  verifyPassword,
  migratePlaintextPasswords,
};
