---
name: shadcn
description: Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. Also triggers for "shadcn init", "create an app with --preset", or "switch to --preset".
user-invocable: false
allowed-tools: Bash(npx shadcn@latest *), Bash(pnpm dlx shadcn@latest *), Bash(bunx --bun shadcn@latest *)
---

# shadcn/ui

A framework for building UI, components, and design systems. Components are added as source code to the user's project via the CLI.

> **IMPORTANT:** Run every CLI command with the project's package runner, chosen from the project's `packageManager` field: `npx shadcn@latest`, `pnpm dlx shadcn@latest`, or `bunx --bun shadcn@latest`. Examples in this document use `npx shadcn@latest`; substitute the project's runner.

## Current Project Context

```json
!`npx shadcn@latest info --json`
```

The JSON above contains the project config and installed components. Use `npx shadcn@latest docs <component>` to get documentation and example URLs for any component.

## Principles

1. **Use existing components first.** Run `npx shadcn@latest search` to check registries (including community registries) before writing custom UI.
2. **Compose, don't reinvent.** Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Chart + Table.
3. **Use built-in variants before custom styles.** E.g. `variant="outline"`, `size="sm"`.
4. **Use semantic colors.** `bg-primary`, `text-muted-foreground` — never raw values like `bg-blue-500`.

## Critical Rules

These rules are **always enforced**. Each section links to a file with Incorrect/Correct code pairs.

### Styling & Tailwind → [styling.md](./rules/styling.md)

- **`className` is for layout, not styling.** Never override component colors or typography.
- **Never use `space-x-*` or `space-y-*`.** Use `flex` with `gap-*`; for vertical stacks, `flex flex-col gap-*`.
- **Use `size-*` when width and height are equal.** `size-10`, not `w-10 h-10`.
- **Use the `truncate` shorthand.** Not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **No manual `dark:` color overrides.** Use semantic tokens (`bg-background`, `text-muted-foreground`).
- **Use `cn()` for conditional classes.** Don't write manual template-literal ternaries.
- **No manual `z-index` on overlay components.** Dialog, Sheet, Popover, etc. handle their own stacking.

### Forms & Inputs → [forms.md](./rules/forms.md)

- **Form layout uses `FieldGroup` + `Field`.** Never a raw `div` with `space-y-*` or `grid gap-*`.
- **Inside `InputGroup`, use `InputGroupInput`/`InputGroupTextarea`.** Never raw `Input`/`Textarea`.
- **Buttons inside inputs use `InputGroup` + `InputGroupAddon`.**
- **Option sets of 2–7 choices use `ToggleGroup`.** Don't loop `Button` with manual active state.
- **Group related checkboxes/radios with `FieldSet` + `FieldLegend`.** Don't use a `div` with a heading.
- **Validation state uses `data-invalid` + `aria-invalid`.** Put `data-invalid` on `Field` and `aria-invalid` on the control. For disabled state: `data-disabled` on `Field`, `disabled` on the control.

### Component Structure → [composition.md](./rules/composition.md)

- **Items always go inside their Group.** `SelectItem` → `SelectGroup`. `DropdownMenuItem` → `DropdownMenuGroup`. `CommandItem` → `CommandGroup`.
- **Custom triggers use `asChild` (radix) or `render` (base).** Check the `base` field from `npx shadcn@latest info`. → [base-vs-radix.md](./rules/base-vs-radix.md)
- **Dialog, Sheet, and Drawer always need a Title.** `DialogTitle`, `SheetTitle`, `DrawerTitle` are required for accessibility. Use `className="sr-only"` if the title must be visually hidden.
- **Use the full Card composition.** `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`. Don't dump everything into `CardContent`.
- **`Button` has no `isPending`/`isLoading` prop.** Compose with `Spinner` + `data-icon` + `disabled`.
- **`TabsTrigger` must be inside `TabsList`.** Never render triggers directly in `Tabs`.
- **`Avatar` always needs `AvatarFallback`,** for when the image fails to load.

### Use Components, Not Custom Markup → [composition.md](./rules/composition.md)

- **Check whether a component exists before writing a styled `div`.**
- **Callouts use `Alert`.** No custom styled divs.
- **Empty states use `Empty`.** No custom empty-state markup.
- **Toasts use `sonner`.** Call `toast()` from `sonner`.
- **Dividers use `Separator`,** not `<hr>` or `<div className="border-t">`.
- **Loading placeholders use `Skeleton`.** No custom `animate-pulse` divs.
- **Labels/tags use `Badge`,** not custom styled spans.

### Icons → [icons.md](./rules/icons.md)

- **Icons in `Button` use `data-icon`.** Set `data-icon="inline-start"` or `data-icon="inline-end"` on the icon.
- **No sizing classes on icons inside components.** Components handle icon sizing via CSS — no `size-4` or `w-4 h-4`.
- **Pass icons as objects, not string keys.** `icon={CheckIcon}`, not a string lookup.

### CLI

- **Never decode or fetch preset codes manually.** Pass them directly to `npx shadcn@latest init --preset <code>`.

## Key Patterns

The most common patterns that differentiate correct shadcn/ui code. For edge cases, see the linked rule files above.

```tsx
// Form layout: FieldGroup + Field, not div + Label.
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// Validation: data-invalid on Field, aria-invalid on the control.
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Invalid email.</FieldDescription>
</Field>

// Icons in buttons: data-icon, no sizing classes.
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// Spacing: gap-*, not space-y-*.
<div className="flex flex-col gap-4">  // correct
<div className="space-y-4">           // wrong

// Equal dimensions: size-*, not w-* h-*.
<Avatar className="size-10">   // correct
<Avatar className="w-10 h-10"> // wrong

// Status colors: Badge variants or semantic tokens, not raw colors.
<Badge variant="secondary">+20.1%</Badge>    // correct
<span className="text-emerald-600">+20.1%</span> // wrong
```

## Component Selection

| Need                       | Use                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Button/action              | `Button` with appropriate variant                                                                   |
| Form inputs                | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| Toggle between 2–5 options | `ToggleGroup` + `ToggleGroupItem`                                                                   |
| Data display               | `Table`, `Card`, `Badge`, `Avatar`                                                                  |
| Navigation                 | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`                                     |
| Overlays                   | `Dialog` (modal), `Sheet` (side panel), `Drawer` (bottom sheet), `AlertDialog` (confirmation)       |
| Feedback                   | `sonner` (toast), `Alert`, `Progress`, `Skeleton`, `Spinner`                                        |
| Command palette            | `Command` inside `Dialog`                                                                           |
| Charts                     | `Chart` (wraps Recharts)                                                                            |
| Layout                     | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`                          |
| Empty states               | `Empty`                                                                                             |
| Menus                      | `DropdownMenu`, `ContextMenu`, `Menubar`                                                            |
| Tooltips/info              | `Tooltip`, `HoverCard`, `Popover`                                                                   |

## Key Fields in Project Context

The injected project context contains these key fields:

- **`aliases`** — use the actual alias prefix for imports (e.g. `@/`, `~/`); never hardcode one.
- **`isRSC`** — when `true`, components using `useState`, `useEffect`, event handlers, or browser APIs need `"use client"` at the top of the file. Always reference this field when advising on the directive.
- **`tailwindVersion`** — `"v4"` uses `@theme inline` blocks; `"v3"` uses `tailwind.config.js`.
- **`tailwindCssFile`** — the global CSS file where custom CSS variables are defined. Always edit this file; never create a new one.
- **`style`** — component visual treatment (e.g. `nova`, `vega`).
- **`base`** — primitive library (`radix` or `base`). Affects component APIs and available props.
- **`iconLibrary`** — determines icon imports: `lucide-react` for `lucide`, `@tabler/icons-react` for `tabler`, etc. Never assume `lucide-react`.
- **`resolvedPaths`** — exact file-system destinations for components, utils, hooks, etc.
- **`framework`** — routing and file conventions (e.g. Next.js App Router vs Vite SPA).
- **`packageManager`** — use this for any non-shadcn dependency installs (e.g. `pnpm add date-fns` vs `npm install date-fns`).

See [cli.md — `info` command](./cli.md) for the full field reference.

## Component Docs, Examples, and Usage

Run `npx shadcn@latest docs <component>` to get the URLs for a component's documentation, examples, and API reference, then fetch those URLs to get the actual content.

```bash
npx shadcn@latest docs button dialog select
```

**When creating, fixing, debugging, or using a component, always run `npx shadcn@latest docs` and fetch the URLs first.** This ensures you work from the correct API and usage patterns instead of guessing.

## Workflow

1. **Get project context.** Already injected above. Run `npx shadcn@latest info` again if you need to refresh it.
2. **Check installed components first.** Before running `add`, check the `components` list in the project context or list the `resolvedPaths.ui` directory. Don't import components that haven't been added, and don't re-add ones already installed.
3. **Find components.** `npx shadcn@latest search`.
4. **Get docs and examples.** Run `npx shadcn@latest docs <component>` for URLs, then fetch them. Use `npx shadcn@latest view` to browse registry items you haven't installed. Use `npx shadcn@latest add --diff` to preview changes to installed components.
5. **Install or update.** `npx shadcn@latest add`. When updating existing components, preview changes first with `--dry-run` and `--diff` (see [Updating Components](#updating-components)).
6. **Fix imports in third-party components.** After adding components from community registries (e.g. `@bundui`, `@magicui`), check the added non-UI files for hardcoded import paths like `@/components/ui/...` — these may not match the project's actual aliases. Get the correct `ui` alias from `npx shadcn@latest info` (e.g. `@workspace/ui/components`) and rewrite the imports. The CLI rewrites imports for its own UI files, but third-party registry components may ship default paths that don't match the project.
7. **Review added components.** After adding a component or block from any registry, **always read the added files and verify they are correct**: check for missing sub-components (e.g. `SelectItem` without `SelectGroup`), missing imports, incorrect composition, or violations of the [Critical Rules](#critical-rules). Also swap any icon imports to the project's `iconLibrary` (e.g. if the registry item uses `lucide-react` but the project uses `hugeicons`, replace the imports and icon names accordingly). Fix all issues before moving on.

### Registry Must Be Explicit

When the user asks to add a block or component, **do not guess the registry**. If none is specified (e.g. "add a login block" without `@shadcn`, `@tailark`, etc.), ask which registry to use. Never default to a registry on behalf of the user.

### Switching Presets

Ask the user first which mode they want: **reinstall**, **merge**, or **skip**.

- **Reinstall** — `npx shadcn@latest init --preset <code> --force --reinstall`. Overwrites all components.
- **Merge** — `npx shadcn@latest init --preset <code> --force --no-reinstall`, then run `npx shadcn@latest info` to list installed components, then for each installed component use `--dry-run` and `--diff` to [smart merge](#updating-components) it individually.
- **Skip** — `npx shadcn@latest init --preset <code> --force --no-reinstall`. Only updates config and CSS; leaves components as-is.

**Important:** Always run preset commands inside the user's project directory. The CLI automatically preserves the current base (`base` vs `radix`) from `components.json`. If you must use a scratch/temp directory (e.g. for `--dry-run` comparisons), pass `--base <current-base>` explicitly — preset codes do not encode the base.

## Updating Components

When the user asks to update a component from upstream while keeping their local changes, use `--dry-run` and `--diff` to merge intelligently. **NEVER fetch raw files from GitHub manually — always use the CLI.**

1. Run `npx shadcn@latest add <component> --dry-run` to see all files that would be affected.
2. For each file, run `npx shadcn@latest add <component> --diff <file>` to see what changed upstream vs local.
3. Decide per file based on the diff:
   - No local changes → safe to overwrite.
   - Has local changes → read the local file, analyze the diff, and apply upstream updates while preserving local modifications.
   - User says "just update everything" → use `--overwrite`, but confirm first.
4. **Never use `--overwrite` without the user's explicit approval.**

## Quick Reference

```bash
# Create a new project.
npx shadcn@latest init --name my-app --preset base-nova
npx shadcn@latest init --name my-app --preset a2r6bw --template vite

# Create a monorepo project.
npx shadcn@latest init --name my-app --preset base-nova --monorepo
npx shadcn@latest init --name my-app --preset base-nova --template next --monorepo

# Initialize existing project.
npx shadcn@latest init --preset base-nova
npx shadcn@latest init --defaults  # shortcut: --template=next --preset=base-nova

# Add components.
npx shadcn@latest add button card dialog
npx shadcn@latest add @magicui/shimmer-button
npx shadcn@latest add --all

# Preview changes before adding/updating.
npx shadcn@latest add button --dry-run
npx shadcn@latest add button --diff button.tsx
npx shadcn@latest add @acme/form --view button.tsx

# Search registries.
npx shadcn@latest search @shadcn -q "sidebar"
npx shadcn@latest search @tailark -q "stats"

# Get component docs and example URLs.
npx shadcn@latest docs button dialog select

# View registry item details (for items not yet installed).
npx shadcn@latest view @shadcn/button
```

- **Named presets:** `base-nova`, `radix-nova`
- **Templates:** `next`, `vite`, `start`, `react-router`, `astro` (all support `--monorepo`) and `laravel` (no `--monorepo` support)
- **Preset codes:** Base62 strings starting with `a` (e.g. `a2r6bw`), from [ui.shadcn.com](https://ui.shadcn.com).

## Detailed References

- [rules/forms.md](./rules/forms.md) — FieldGroup, Field, InputGroup, ToggleGroup, FieldSet, validation states
- [rules/composition.md](./rules/composition.md) — Groups, overlays, Card, Tabs, Avatar, Alert, Empty, Toast, Separator, Skeleton, Badge, Button loading
- [rules/icons.md](./rules/icons.md) — data-icon, icon sizing, passing icons as objects
- [rules/styling.md](./rules/styling.md) — Semantic colors, variants, className, spacing, size, truncate, dark mode, cn(), z-index
- [rules/base-vs-radix.md](./rules/base-vs-radix.md) — asChild vs render, Select, ToggleGroup, Slider, Accordion
- [cli.md](./cli.md) — Commands, flags, presets, templates
- [customization.md](./customization.md) — Theming, CSS variables, extending components
