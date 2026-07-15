---
name: migrate-to-vinext
description: Migrates Next.js projects to vinext (Vite-based Next.js reimplementation). Load when asked to migrate, convert, or switch from Next.js to vinext. Handles compatibility scanning, package replacement, Vite config generation, ESM conversion, and deployment setup (Cloudflare Workers natively, other platforms via Nitro).
---

# Migrate Next.js to vinext

vinext reimplements the Next.js API surface on Vite. Existing `app/`, `pages/`, and `next.config.js` work as-is. Migration consists of three things only: a package swap, config generation, and ESM conversion. Application code is never changed.

## Step 0 (Required First): Verify This Is a Next.js Project

1. Confirm `next` appears in `dependencies` or `devDependencies` in `package.json`.
   - If it does not, STOP — this skill does not apply.
2. Detect the package manager from the lockfile:

   | Lockfile                    | Manager | Install       | Uninstall       |
   | --------------------------- | ------- | ------------- | --------------- |
   | `pnpm-lock.yaml`            | pnpm    | `pnpm add`    | `pnpm remove`   |
   | `yarn.lock`                 | yarn    | `yarn add`    | `yarn remove`   |
   | `bun.lockb` / `bun.lock`    | bun     | `bun add`     | `bun remove`    |
   | `package-lock.json` or none | npm     | `npm install` | `npm uninstall` |

3. Detect the router:
   - `app/` directory at the project root or under `src/` → App Router.
   - Only `pages/` → Pages Router.
   - Both directories can coexist.

## Quick Reference: vinext CLI

| Command         | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `vinext check`  | Scan project for compatibility issues, produce scored report            |
| `vinext init`   | Automated migration — installs deps, generates config, converts to ESM  |
| `vinext dev`    | Development server with HMR                                             |
| `vinext build`  | Production build (multi-environment for App Router)                     |
| `vinext start`  | Local production server                                                 |
| `vinext deploy` | Build and deploy to Cloudflare Workers                                  |

## Phase 1: Check Compatibility

- Run `vinext check`. If vinext is not installed yet, run it as `npx vinext check`.
- Review the scored report.
- If critical incompatibilities exist, inform the user before proceeding.

See [references/compatibility.md](references/compatibility.md) for supported/unsupported features and ecosystem library status.

## Phase 2: Automated Migration (Recommended Path)

Run `vinext init`. It performs these steps:

1. Runs `vinext check` for a compatibility report.
2. Installs `vite` as a devDependency (plus `@vitejs/plugin-rsc` for App Router).
3. Adds `"type": "module"` to `package.json`.
4. Renames CJS config files (e.g., `postcss.config.js` → `.cjs`) to avoid ESM conflicts.
5. Adds `dev:vinext` and `build:vinext` scripts to `package.json`.
6. Generates a minimal `vite.config.ts`.

`vinext init` is non-destructive: the existing Next.js setup keeps working alongside vinext. Use the `dev:vinext` script to test before fully switching over.

Next step:
- If `vinext init` succeeds → skip Phase 3 and go to Phase 5 (Verify), plus Phase 4 if deploying.
- If it fails, or the user prefers manual control → continue to Phase 3.

## Phase 3: Manual Migration (Fallback)

Use only when `vinext init` doesn't work or the user wants full control.

### 3a. Replace packages

```bash
# Example with npm:
npm uninstall next
npm install vinext
npm install -D vite
# App Router only:
npm install -D @vitejs/plugin-rsc
```

Use the equivalent commands for the package manager detected in Step 0.

### 3b. Update scripts

Replace every `next` command in `package.json` scripts:

| Before       | After          | Notes                      |
| ------------ | -------------- | -------------------------- |
| `next dev`   | `vinext dev`   | Dev server with HMR        |
| `next build` | `vinext build` | Production build           |
| `next start` | `vinext start` | Local production server    |
| `next lint`  | `vinext lint`  | Delegates to eslint/oxlint |

Preserve existing flags: `next dev --port 3001` → `vinext dev --port 3001`.

### 3c. Convert to ESM

1. Add `"type": "module"` to `package.json`.
2. Rename CJS config files:
   - `postcss.config.js` → `postcss.config.cjs`
   - `tailwind.config.js` → `tailwind.config.cjs`
   - Any other `.js` config that uses `module.exports` → `.cjs`

### 3d. Generate vite.config.ts

Minimal config — identical for both Pages Router and App Router:

```ts
import vinext from "vinext";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [vinext()] });
```

Notes:

- For App Router, vinext auto-registers `@vitejs/plugin-rsc` unless the `rsc` option is explicitly `false`. No manual RSC plugin config is needed for local development.
- If the project already has a custom Vite config, prefer Vite 8-native keys when editing it: `oxc`, `optimizeDeps.rolldownOptions`, and `build.rolldownOptions`. The older `esbuild` and `build.rollupOptions` settings still work for now but are migration targets.
- See [references/config-examples.md](references/config-examples.md) for config variants per router and deployment target.

## Phase 4: Deployment (Optional)

### Option A: Cloudflare Workers (recommended for Cloudflare)

Run `vinext deploy`. It:

- Auto-generates `wrangler.jsonc`, the worker entry, and Vite config if missing.
- Installs `@cloudflare/vite-plugin` and `wrangler`.
- Builds and deploys.

For manual setup or custom worker entries, see [references/config-examples.md](references/config-examples.md).

#### Cloudflare Bindings (D1, R2, KV, AI, Queues, Durable Objects, etc.)

To access bindings, use `import { env } from "cloudflare:workers"` in any server component, route handler, or server action:

```tsx
import { env } from "cloudflare:workers";

export default async function Page() {
  const result = await env.DB.prepare("SELECT * FROM posts").all();
  return <div>{JSON.stringify(result)}</div>;
}
```

This works because `@cloudflare/vite-plugin` runs server environments in workerd, where `cloudflare:workers` is a native module. No custom worker entry, no `getPlatformProxy()`, no special configuration — just import and use.

Requirements:

- Bindings must be defined in `wrangler.jsonc`.
- For TypeScript types, run `wrangler types`.

**IMPORTANT — DO NOT** use `getPlatformProxy()`, `getRequestContext()`, or custom worker entries with `fetch(request, env)` to access bindings. These are older patterns. `cloudflare:workers` is the recommended approach and works out of the box with vinext.

### Option B: Other platforms (via Nitro)

For Vercel, Netlify, AWS, Deno Deploy, or any other [Nitro-supported platform](https://v3.nitro.build/deploy), add the Nitro Vite plugin:

```bash
npm install nitro
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vinext from "vinext";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [vinext(), nitro()],
});
```

Build and deploy:

```bash
NITRO_PRESET=vercel npx vite build    # Vercel
NITRO_PRESET=netlify npx vite build   # Netlify
NITRO_PRESET=deno_deploy npx vite build  # Deno Deploy
NITRO_PRESET=node npx vite build      # Node.js server
```

Nitro auto-detects the platform in most CI/CD environments, so the preset is often unnecessary.

**Note:** Nitro also works for Cloudflare Workers, but prefer the native integration (Option A: `vinext deploy` / `@cloudflare/vite-plugin`). It provides the best developer experience: `cloudflare:workers` bindings, KV caching, image optimization, and one-command deploys.

## Phase 5: Verify

1. Run `vinext dev` to start the development server.
2. Confirm the server starts without errors.
3. Navigate key routes and check functionality.
4. Report the result to the user. If errors occur, share the full output.

See [references/troubleshooting.md](references/troubleshooting.md) for common migration errors.

## Known Limitations

| Feature                       | Status                                                    |
| ----------------------------- | --------------------------------------------------------- |
| `next/image` optimization     | Remote images via @unpic; no build-time optimization      |
| `next/font/google`            | CDN-loaded, not self-hosted                               |
| Domain-based i18n             | Not supported; path-prefix i18n works                     |
| `next/jest`                   | Not supported; use Vitest                                 |
| Turbopack/webpack config      | Ignored; use Vite plugins instead                         |
| `runtime` / `preferredRegion` | Route segment configs ignored                             |
| PPR (Partial Prerendering)    | Use `"use cache"` directive instead (Next.js 16 approach) |

## Anti-patterns (DO NOT)

- **DO NOT modify `app/`, `pages/`, or any application code.** vinext shims all `next/*` imports — no import rewrites needed.
- **DO NOT rewrite `next/*` imports to `vinext/*`** in application code. Imports like `next/image`, `next/link`, and `next/server` resolve automatically.
- **DO NOT copy webpack/Turbopack config into Vite config.** Use Vite-native plugins instead.
- **DO NOT skip the compatibility check.** Run `vinext check` before migration to surface issues early.
- **DO NOT remove `next.config.js`** unless replacing it with `next.config.ts` or `.mjs`. vinext reads it for redirects, rewrites, headers, basePath, i18n, images, and env config.
- **DO NOT use `getPlatformProxy()` or custom worker entries for bindings.** Use `import { env } from "cloudflare:workers"` instead — the modern pattern, works out of the box with vinext and `@cloudflare/vite-plugin`.
- **For Cloudflare Workers, DO prefer the native integration over Nitro** (see Phase 4, Option A).
