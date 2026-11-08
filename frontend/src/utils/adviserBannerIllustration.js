const illustrationKey = (userId) => `adviser-banner-illustration:${userId}`;

export function getAdviserBannerIllustration(userId) {
  try {
    return userId && localStorage.getItem(illustrationKey(userId)) === "male" ? "male" : "female";
  } catch {
    return "female";
  }
}

export function saveAdviserBannerIllustration(userId, choice) {
  if (!userId || (choice !== "male" && choice !== "female")) return;
  try {
    localStorage.setItem(illustrationKey(userId), choice);
  } catch {
    throw new Error("This browser could not save your banner illustration choice.");
  }
}
