import type { SubredditRule } from "../../src/types.js";

export const sampleRules: SubredditRule[] = [
  { id: "1", name: "Be civil", description: "No harassment, hate, threats, or personal attacks." },
  { id: "2", name: "No spam", description: "Do not post repetitive promotions, scams, or low-effort self-promotion." },
  { id: "3", name: "Stay on topic", description: "Posts must be directly related to the community subject." }
];
