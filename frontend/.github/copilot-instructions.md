# TRAFIQ Frontend Workspace Instructions

## Project overview
This workspace contains a frontend-only React application built with Vite.

- Framework: React 19
- Bundler: Vite
- Router: React Router DOM v7
- Map library: Leaflet / react-leaflet
- Charts: Recharts
- Styling: plain CSS imported into components
- Entry point: `src/main.jsx`
- Root app router: `src/App.jsx`

There is no backend code in this repository. Do not add server-side routes or backend frameworks here.

## Main app boundaries
- `src/apps/public/` — public user-facing views: home, route planner, route status, map UI, proximity alerts
- `src/apps/admin/` — admin portal: dashboard, live monitoring, incidents, congestion, AI agent, snapshots, analytics, settings
- `src/shared/context/` — app-wide providers and authentication/navigation state
- `src/shared/hooks/` — reusable hooks for geolocation, notifications, proximity, routes, trafiq data
- `src/shared/services/` — API/network helper(s)

## Common conventions
- Keep JSX in `.jsx` files and use function components + hooks.
- Preserve the current routing structure in `src/App.jsx` and `src/apps/*`.
- Use existing contexts rather than adding a new global state library.
- Keep styling via existing `.css` files; avoid introducing CSS frameworks unless explicitly requested.
- Do not add tests or testing infrastructure; this workspace currently has no test setup.

## Recommended workflows
- For public UI changes, start in `src/apps/public/`.
- For admin UI changes, start in `src/apps/admin/`.
- For shared logic or cross-app state, use `src/shared/`.
- For new visual components, add them near the relevant page under `components/`.
- For data/state changes, add or update context providers in `src/shared/context/`.

## Scripts
Use these commands from the repository root:

- `npm run dev` — start Vite development server
- `npm run build` — build production assets
- `npm run lint` — run ESLint across the codebase
- `npm run preview` — preview the production build locally

## When helping the user
- Ask for clarification if a requested feature spans both admin and public apps.
- Confirm route paths before adjusting navigation behavior.
- Preserve existing design structure and naming conventions.
- If a task is unclear about data flow, ask whether the change should be local to UI only or also require shared context updates.

## What not to do
- Do not add backend / server code in this repo.
- Do not change this workspace to TypeScript.
- Do not introduce a new state management library.
- Do not assume there is a test runner or test configuration.
