export const NOTIFICATION_BUDDY_CHARACTERS = [
  "Lion",
  "Dog",
  "Cat",
  "Panda",
  "Bunny",
  "Penguin",
  "Mouse",
  "Dragon",
  "Anime Hero",
  "Robot Cat",
  "Cartoon Kid",
  "Brave Soldier",
  "Adventure Hunter"
];

const CHARACTER_ALIASES = {
  Puppy: "Dog",
  Fox: "Cat"
};

const CHARACTER_LABELS = {
  "Anime Hero": "Hero",
  "Robot Cat": "Robo Cat",
  "Cartoon Kid": "Kid",
  "Brave Soldier": "Soldier",
  "Adventure Hunter": "Hunter"
};

export const normalizeNotificationBuddyCharacter = (value) => {
  const raw = String(value || "").trim();
  if (NOTIFICATION_BUDDY_CHARACTERS.includes(raw)) return raw;
  const alias = CHARACTER_ALIASES[raw];
  return NOTIFICATION_BUDDY_CHARACTERS.includes(alias) ? alias : "Cat";
};

export const getNotificationBuddyLabel = (value) => {
  const safe = normalizeNotificationBuddyCharacter(value);
  return CHARACTER_LABELS[safe] || safe;
};
