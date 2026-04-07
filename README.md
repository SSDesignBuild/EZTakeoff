# S&S Design Build Take-Off Studio

A Netlify-ready React + TypeScript prototype for service-based estimating, material take-offs, and layout visualization.

## Included workflows

- Decks
- Screen Rooms
- Patio Covers
- Renaissance Screen Rooms

## What this prototype does

- Separates estimating by service type
- Captures project-specific dimensions and build conditions
- Generates rule-driven material summaries and stock recommendations
- Visualizes layouts for faster review before ordering
- Persists current form state in local browser storage

## Tech stack

- Vite
- React 18
- TypeScript
- React Router
- Netlify deployment config included

## Run locally

```bash
npm install
npm run dev
```

## Build for production

```bash
npm install
npm run build
```

## Deploy to Netlify

1. Push this folder to a GitHub repository.
2. Connect the repository to Netlify.
3. Netlify will use the included `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`

## Recommended next step: Supabase

Use Supabase for:

- authentication
- saved projects
- product tables
- stock lengths
- rule sets
- order history

Suggested tables:

- `services`
- `products`
- `stock_lengths`
- `rule_sets`
- `projects`
- `project_inputs`
- `material_orders`

## Important note about calculations

The current estimator formulas are scaffolding. They are intentionally organized so S&S can replace demo assumptions with your exact:

- construction logic
- stock lengths
- vendor product data
- installation methods
- order rounding rules

The main calculation file is:

- `src/lib/estimate.ts`

The main service definitions are:

- `src/data/services.ts`

Those two files are the fastest place to begin swapping in real business logic.
