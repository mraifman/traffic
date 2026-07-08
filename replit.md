# Traffic Analyzer

A browser-based traffic intelligence workstation for counting and timing vehicles, cyclists, and pedestrians from a fixed camera. Uses TensorFlow.js + COCO-SSD for real-time ML detection with no server-side inference required.

## Run & Operate

- `pnpm --filter @workspace/traffic-analyzer run dev` — run the frontend (auto-assigned port)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS (dark, dense monitoring aesthetic)
- ML: `@tensorflow-models/coco-ssd` + `@tensorflow/tfjs` (browser inference, Google CDN)
- Tracking: custom IoU-based centroid tracker (`src/lib/tracker.ts`)
- Speed estimation: pixel displacement × pixels-per-meter calibration ratio
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `artifacts/traffic-analyzer/src/lib/detector.ts` — TF.js COCO-SSD detection wrapper
- `artifacts/traffic-analyzer/src/lib/tracker.ts` — IoU-based object tracker + speed calc
- `artifacts/traffic-analyzer/src/hooks/useAnalyzer.ts` — main orchestration hook
- `artifacts/traffic-analyzer/src/context/AnalyzerContext.tsx` — shared context (prevents state loss on route change)
- `artifacts/traffic-analyzer/src/pages/` — home, analyze, setup, sessions
- `artifacts/api-server/src/routes/sessions.ts` — session CRUD API routes
- `lib/db/src/schema/sessions.ts` — sessions table schema
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)

## Architecture decisions

- **Browser-only inference**: TF.js COCO-SSD runs entirely in the browser. No Python backend or server-side inference. Models download from Google CDN on first use (~20MB, cached afterwards).
- **Shared analyzer context**: `AnalyzerProvider` wraps the router so analyzer state (video refs, counts, model) persists across route changes (home → analyze).
- **IoU tracking**: Objects are matched frame-to-frame by IoU overlap. Objects are counted once they've been stably tracked for ≥3 frames. Tracks are dropped after 8 missed frames.
- **Speed estimation**: Displacement of tracked centroid over a ~300ms window, converted from pixels to meters via user-supplied pixels-per-meter calibration. X and Y use correct per-axis scaling (width vs height).
- **COCO classes tracked**: person (0), bicycle (1), car (2), motorcycle (3), bus (5), truck (7).

## Product

- **Home**: Choose live camera or upload a video file to analyze
- **Analyze**: Real-time detection overlay + live counts + speed dashboard + save session
- **Setup**: Step-by-step field guide for camera placement, calibration, and best practices
- **Sessions**: Saved session history with counts and speed stats

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- TF.js model is ~20MB and downloads on first use. Progress shown in the Analyze page.
- Speed accuracy requires accurate pixels-per-meter calibration (measure a known distance in-frame).
- Speed estimates are most accurate for perpendicular movement (objects crossing the frame horizontally).
- COCO-SSD may miss small/distant objects — camera should be positioned 3–6m high and 10–15m of road in frame.
- The `AnalyzerProvider` must wrap the router (not inside it) to ensure state persists across route navigations.
- After each OpenAPI spec change, re-run codegen before using the updated types.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
