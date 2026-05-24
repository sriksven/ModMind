# ModMind

ModMind is a Devvit moderation assistant for Reddit communities. It evaluates incoming posts and comments against subreddit rules, returns a suggested action, logs moderator feedback, and uses that feedback for weekly digests and rule gap analysis.

## Current Status

ModMind is published as an unlisted Devvit app and can be installed on subreddits where the developer account is a moderator.

- Devvit app: https://developers.reddit.com/apps/modmind-f4lcon46
- GitHub repository: https://github.com/sriksven/ModMind
- Published app version: `0.0.17`
- Test subreddit: `r/modmindtest`

The repository contains the TypeScript implementation, Devvit runtime wiring, Redis-backed storage layer, OpenAI prompt/client layer, tests, policy documents, and local documentation.

## Features

- Evaluates new posts and comments against subreddit rules.
- Produces a moderator-facing suggested action, confidence score, reason, and draft reply.
- Handles multilingual moderation with language detection, translated rules, and bilingual reply support.
- Logs evaluations and moderator outcomes for analytics.
- Adds a post-level moderator menu action, `ModMind: Override flag`, to approve a flagged post and record the override for digests and rule gap analysis.
- Generates weekly moderation digests with volume, rule, language, and pattern summaries.
- Runs monthly rule gap analysis when enough override data exists.
- Includes safeguards for app-authored comment loops, clean-content approval, and explicit 0-100 confidence handling.

## Verification

- `npm run build` passes.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm test` passes: 38 unit tests.
- `npm run test:integration` passes: 12 integration tests.
- `npm run test:coverage` passes with 80%+ coverage for `src/ai` and `src/storage`.
- Live playtest passed clean/spam/harassment cases, all 15 supported language clean-post cases, weekly digest, rule gap "not enough data", and rapid concurrent submissions.

## Commands

- `npm install`
- `npm run type-check`
- `npm test`
- `npm run test:integration`
- `npm run build`
- `npm run docs:validate`

## Required Secrets

- OpenAI API key in the Devvit installation setting `openaiApiKey`
- Reddit/Devvit CLI authentication through `devvit login`

## Policy Documents

- Terms: https://github.com/sriksven/ModMind/blob/main/TERMS.md
- Privacy: https://github.com/sriksven/ModMind/blob/main/PRIVACY.md
