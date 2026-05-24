import type { ContentItem } from "../../src/types.js";

export const spamPost: ContentItem = {
  id: "post_spam",
  kind: "post",
  subredditName: "modmind",
  authorName: "new_user",
  title: "Buy cheap followers now",
  body: "Limited time promotion. Visit my site and buy followers.",
  createdAt: Date.now()
};

export const cleanPost: ContentItem = {
  id: "post_clean",
  kind: "post",
  subredditName: "modmind",
  authorName: "regular_user",
  title: "Question about the weekly thread",
  body: "Is this the right place to ask about community resources?",
  createdAt: Date.now()
};

export const spanishPost: ContentItem = {
  id: "post_es",
  kind: "post",
  subredditName: "modmind",
  authorName: "spanish_user",
  title: "Hola, tengo una pregunta",
  body: "Gracias por la ayuda con esto.",
  createdAt: Date.now()
};
