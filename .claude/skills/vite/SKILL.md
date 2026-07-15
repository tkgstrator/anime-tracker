---
name: vite
description: Vite build tool configuration, plugin API, SSR, and Vite 8 Rolldown migration. Use when working with Vite projects, vite.config.ts, Vite plugins, or building libraries/SSR apps with Vite.
metadata:
  author: Anthony Fu
  version: "2026.1.31"
  source: Generated from https://github.com/vitejs/vite, scripts at https://github.com/antfu/skills
---

# Vite

Vite is a next-generation frontend build tool with a fast dev server (native ESM + HMR) and optimized production builds.

> **Version baseline:** This skill is based on Vite 8 beta (Rolldown-powered). Vite 8 uses the Rolldown bundler and the Oxc transformer.

## Rules

- **DO** use TypeScript: prefer `vite.config.ts`.
- **DO** always use ESM. **DON'T** use CommonJS.

## Reference Files

This file is an index. For detail on a topic, read the matching file under `references/`:

| Topic | Read when working on... | Reference file |
|-------|-------------------------|----------------|
| Configuration | `vite.config.ts`, `defineConfig`, conditional configs, `loadEnv` | [references/core-config.md](references/core-config.md) |
| Features | `import.meta.glob`, asset queries (`?raw`, `?url`), `import.meta.env`, HMR API | [references/core-features.md](references/core-features.md) |
| Plugin API | Vite-specific hooks, virtual modules, plugin ordering | [references/core-plugin-api.md](references/core-plugin-api.md) |
| Build & SSR | Library mode, SSR middleware mode, `ssrLoadModule`, JavaScript API | [references/build-and-ssr.md](references/build-and-ssr.md) |
| Environment API | Vite 6+ multi-environment support, custom runtimes | [references/environment-api.md](references/environment-api.md) |
| Rolldown Migration | Vite 8 changes: Rolldown bundler, Oxc transformer, config migration | [references/rolldown-migration.md](references/rolldown-migration.md) |

## Quick Reference

### CLI Commands

```bash
vite              # Start dev server
vite build        # Production build
vite preview      # Preview production build
vite build --ssr  # SSR build
```

### Common Config

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  resolve: { alias: { '@': '/src' } },
  server: { port: 3000, proxy: { '/api': 'http://localhost:8080' } },
  build: { target: 'esnext', outDir: 'dist' },
})
```

### Official Plugins

- `@vitejs/plugin-vue` - Vue 3 SFC support
- `@vitejs/plugin-vue-jsx` - Vue 3 JSX
- `@vitejs/plugin-react` - React with Oxc/Babel
- `@vitejs/plugin-react-swc` - React with SWC
- `@vitejs/plugin-legacy` - Legacy browser support
