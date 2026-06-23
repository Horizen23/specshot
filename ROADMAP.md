# SpecShot Roadmap

This document outlines the planned features and improvements for future releases of SpecShot. We have prioritized these phases based on immediate developer impact and long-term vision.

## Phase 2: Identity & Developer Experience (High Priority) 🔥

**1. Branding & Identity (Logo & Mascot)** ✅

- **Goal:** Give SpecShot a recognizable, premium identity.
- **Features:**
  - Design an official logo and/or mascot (e.g., a futuristic sniper or a sleek camera lens representing "Spec" + "Shot").
  - Create standard branding assets, social preview images, and high-quality README illustrations.

**2. Mock Request Validation (Smart Request Guard)**

- **Goal:** Help frontend developers catch schema mismatches instantly during development.
- **Features:**
  - The Mock Server will act as a strict bouncer. When the frontend makes a request, it validates the incoming payload (Body, Query, Params) against the OpenAPI specification using Zod.
  - If the frontend sends an invalid data type, the Mock Server automatically rejects it with an `HTTP 400 Bad Request` and detailed error paths.

**3. Request Recording & Replay (VCR Mode) 📼**

- **Goal:** Allow SpecShot to act as a proxy that "records" real backend responses.
- **Features:**
  - Auto-save real backend responses into `.specshot/mocks.json` as overrides.
  - Run tests or dev environments completely offline using the recorded "cassettes".
  - One-click record/replay toggle from the Web Dashboard.

**4. Interactive CLI (TUI) 💻**

- **Goal:** Make the developer experience frictionless for those who don't want to memorize flags.
- **Features:**
  - Run `npx specshot` to see a beautiful terminal UI.
  - Navigate menus to select generation options, start mock server, or configure endpoints using arrow keys.

## Phase 3: Ecosystem Expansion 🌐

**1. GraphQL Support**

- **Goal:** Add support for introspecting GraphQL endpoints and parsing `.graphql` schemas.
- **Features:**
  - Generate fully typed GraphQL clients.
  - Mock Server integration to mock GraphQL resolvers with Faker.js support.

**2. Mock Server WebSockets**

- **Goal:** Introduce WebSocket support in the built-in mock server.
- **Features:**
  - Mock WebSocket endpoint configuration.
  - Dashboard UI to manually trigger/push WebSocket events to the client in real-time.

## Phase 4: The Ultimate Integration 🔗

**1. Monorepo Super-Glue (Zero-step CodeGen)**

- **Goal:** Create the tightest integration possible for full-stack TypeScript monorepos (e.g., Turborepo, Nx).
- **Features:**
  - Skip the `openapi.json` file completely.
  - SpecShot dynamically reads TypeScript types directly from the backend framework (NestJS, tRPC, Hono) and seamlessly exposes them to the frontend on-the-fly.

**2. SpecShot Browser Extension**

- **Goal:** Control mocks directly from the browser where you test.
- **Features:**
  - A Chrome/Firefox extension that intercepts API requests directly at the network layer.
  - Toggle between real and mock responses with a single click in the browser popup without running the Web Dashboard.

## Phase 5: The Wild Future & Community 🤯

**1. Smart SQLite Auto-CRUD (Stateful Mock Server)**

- **Goal:** Move from stateless, flat-file mocks to a fully stateful, in-memory mock backend.
- **Features:**
  - SpecShot automatically spins up an in-memory SQLite database based on the OpenAPI schema.
  - A `POST` request actually saves data, and a subsequent `GET` request retrieves it. Real CRUD, zero backend code.

**2. Official Documentation Site (`specshot.dev`)**

- **Goal:** Move beyond a simple README to a dedicated learning hub.
- **Features:**
  - Build a dark-mode ready documentation site (VitePress/Nextra) with interactive tutorials.
  - An online "Playground" to test SpecShot code generation directly in the browser.

---

_Got an idea for the roadmap? Open an issue on our GitHub repo!_
