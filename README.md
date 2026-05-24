# ModMind

ModMind is a Devvit moderation assistant for Reddit communities. It evaluates incoming posts and comments against subreddit rules, returns a suggested action, logs moderator feedback, and uses that feedback for weekly digests and rule gap analysis.

## Current Status

This repository contains the complete local TypeScript implementation, mockable Devvit integration boundaries, storage layer, AI prompt layer, unit tests, integration tests, and documentation. Live Reddit playtesting still requires Devvit login, a test subreddit, and an OpenAI API key configured in app settings.

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

