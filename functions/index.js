const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const ADMIN_EMAIL = "rodrigo.bermudez@kellyeducation.com";

exports.listRegisteredUsers = onCall({ region: "us-central1", cors: true }, async (request) => {
  const caller = request.auth?.token?.email?.toLowerCase();
  if (!caller || caller !== ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }

  const users = [];
  let pageToken;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!u.email) continue;
      users.push({
        uid: u.uid,
        email: u.email.toLowerCase(),
        displayName: u.displayName || "",
        disabled: u.disabled,
        emailVerified: u.emailVerified,
        creationTime: u.metadata.creationTime || "",
        lastSignInTime: u.metadata.lastSignInTime || ""
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  users.sort((a,b) => a.email.localeCompare(b.email));
  return { users };
});
