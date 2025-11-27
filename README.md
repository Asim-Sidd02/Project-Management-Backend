# Sentinel Backend

Node.js + Express + MongoDB backend for the **Sentinel** project management app.

## Features

- JWT auth (signup/login)
- Projects with roles: owner, leader, member
- Tasks per project with status (`not_started`, `in_progress`, `completed`)
- Per-user notes on tasks
- Project invitations by email (owner/leader only)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

3. Run locally:

```bash
npm run dev
```

Deploy to Render using `npm install` as build and `npm start` as start command.
