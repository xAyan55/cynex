# Build & Test Commands

```bash
# Compile TypeScript (check for errors)
pnpm build

# Generate Prisma client
pnpm prisma:generate

# Run database migration (dev)
pnpm prisma:migrate

# Run application
pnpm start

# Production build
pnpm build
```

# Important Notes

- `pnpm` is the package manager
- Express 5 types: use `paramStr()` helper for `req.params[key]` (returns `string | string[]`)
- All coin/resource operations must go through WalletService or RewardPipeline
- Config uses typed interfaces via ConfigService - no hardcoded business logic
- New modules are auto-discovered - no manual registration needed
- Sidebar items registered in `uiComponentHandler.ts`
