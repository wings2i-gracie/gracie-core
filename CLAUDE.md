# gracie-core — CLAUDE.md

## Identity
Package: @wings2i-gracie/core
Version: 0.1.0
Purpose: Tier 1 platform package for the GRACie suite.
         Shared server logic, client entry point, Prisma schema.
Registry: GitHub Packages (https://npm.pkg.github.com)
Repo: github.com/wings2i-gracie/gracie-core

## Rules
- May only depend on @wings2i-gracie/contracts (no other GRACie packages).
- TypeScript: module Node16 / moduleResolution node16, strict: true.
- Pre-1.0: contracts may evolve freely.
- Post-1.0: strict semver. Breaking changes → v2.

## Structure
/server/src   → Node.js / Express platform server
/client/src   → React client entry point
/prisma       → schema.prisma + migrations (postgresql, no models yet)

## Build
npm run build     → tsc compiles to dist/
npm run typecheck → zero errors expected

## Publish
Push a v* tag → GitHub Actions publishes to GitHub Packages.

## Sessions
E1.2 (2026-05-19) — Initial skeleton. server/src/index.ts + client/src/index.ts
  stubs, prisma/schema.prisma (datasource + generator, no models), package.json,
  tsconfig.json (Node16/node16), .npmrc, .gitignore, publish workflow.
  Depends on @wings2i-gracie/contracts@^0.1.0. v0.1.0 published.
