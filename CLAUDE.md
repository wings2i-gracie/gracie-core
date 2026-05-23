# gracie-core — CLAUDE.md

## Identity
Package: @wings2i-gracie/core
Version: 0.2.0-alpha.1
Purpose: Tier 1 platform package for the GRACie suite.
         Shared server logic, client entry point, Prisma schema.
Registry: GitHub Packages (https://npm.pkg.github.com)
Repo: github.com/wings2i-gracie/gracie-core

## Rules
- May only depend on @wings2i-gracie/contracts plus pg/adapter-pg (no other GRACie packages).
- TypeScript: module Node16 / moduleResolution node16, strict: true.
- Pre-1.0: contracts may evolve freely.
- Post-1.0: strict semver. Breaking changes → v2.

## Structure
/server/src   → Node.js / Express platform server
/client/src   → React client entry point
/prisma       → schema.prisma + migrations (postgresql)

## Prisma Pattern
Custom output: `output = "../server/src/generated/prisma-client"`.
Build script copies generated client to dist/ for packaging.
PrismaClient MUST be constructed with PrismaPg adapter (Prisma 7 client engine
requires driver adapter for custom output paths):
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
Models: CoreTenant (@@map "core_tenants"), CoreUser (@@map "core_users").

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
E1.3 (2026-05-19) — CI/CD scaffolding. Added .github/workflows/ci.yml
  (typecheck, lint, dep-direction, prisma-check jobs). Added
  .github/workflows/publish.yml with NODE_AUTH_TOKEN on both npm ci and
  npm publish steps using PACKAGES_TOKEN. Added ESLint devDependencies
  (eslint@^8, @typescript-eslint/parser+plugin@^8) and .eslintrc.json.
E2.1 (2026-05-25) — CoreTenant/CoreUser models + auth/users extraction.
  prisma/schema.prisma: CoreTenant (@@map core_tenants), CoreUser (@@map core_users),
  TenantStatus/UserRole enums; prisma.config.ts with defineConfig.
  server/src/modules/auth/auth.service.ts: generateAccessToken, buildTokenPayload,
  validateCredentials, hashPassword, verifyPassword, validatePasswordPolicy,
  generateTempPassword. Uses CORE_JWT_SECRET env var (fallback JWT_ACCESS_SECRET).
  server/src/middleware/auth.middleware.ts: requireAuth (CORE_JWT_SECRET fallback),
  requireTenant.
  server/src/modules/users/users.service.ts: getUsers, getUserById, updateUser,
  deactivateUser, resetPassword — all use prisma.coreUser.
  server/src/index.ts: exports all above.
  Added @prisma/adapter-pg + pg deps (Prisma 7 driver adapter requirement).
  v0.2.0-alpha.1 tagged + published. Commits: f1e6a8b, 8fc6e57.
