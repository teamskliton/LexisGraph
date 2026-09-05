# LexisGraph — Frontend Client

The official web frontend for **LexisGraph**, built with **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4**, **TypeScript**, and **shadcn/ui**.

---

## Key Features

- **Public Landing Page**: Modern, responsive presentation of LexisGraph capabilities, architecture flow, and value proposition.
- **Enterprise Dashboard**: KPI cards, compliance health trends, organization score comparisons, and reviewer queues.
- **Document Management**: Document upload (PDF, DOCX, TXT), category filtering, metadata extraction, and clause segmentation status.
- **Interactive Knowledge Graph**: Canvas-based exploration of legal documents, regulations, clauses, and cross-references.
- **Compliance & Gap Analysis**: Clause-by-clause compliance status (`compliant`, `partial`, `gap`), confidence metrics, and explainable citations.
- **Audit & Remediation Lifecycle**: Finding assignments, evidence submissions, auditor verification workflows, and timeline tracking.
- **AI Legal Assistant**: Conversational GraphRAG interface with real-time streaming, document context viewer, and grounded citations.
- **Multi-Tenant Organizations**: Role-based access control (Admin, Compliance Officer, Auditor, Viewer) and organization workspaces.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** | App Router, Server Components & Static Site Generation (Turbopack) |
| **React 19** | Modern UI primitives and hooks |
| **TypeScript** | Strict end-to-end type safety |
| **Tailwind CSS v4** | Token-based responsive design system |
| **shadcn/ui & Radix** | Accessible, composable UI components |
| **Axios** | REST client with automatic JWT bearer injection |
| **Lucide React** | Clean, modern iconography |

---

## Project Structure

```
client/
├── public/                 # Static assets & logos
├── src/
│   ├── app/                # Next.js App Router pages & layouts
│   │   ├── (auth)/         # /login, /register, /invite
│   │   ├── compliance/     # /compliance, /compliance/reports, /compliance/progress
│   │   ├── dashboard/      # /dashboard, /dashboard/audit-logs, /dashboard/users
│   │   ├── documents/      # /documents repository
│   │   ├── findings/       # /findings management & remediation
│   │   ├── knowledge-graph/# /knowledge-graph visualizer
│   │   ├── reports/        # /reports viewer & comparisons
│   │   ├── layout.tsx      # Root layout & theme providers
│   │   └── page.tsx        # Public landing page
│   ├── components/         # Reusable UI & feature components
│   │   ├── chat/           # Conversational assistant & document viewer
│   │   ├── compliance/     # Status badges, share modals, scoring cards
│   │   ├── dashboard/      # KPI widgets, charts, activity lists
│   │   ├── features/       # Document upload, organization switchers
│   │   ├── knowledge-graph/# Interactive canvas & controls
│   │   ├── landing/        # Hero, workflow, capabilities sections
│   │   ├── layout/         # Header, sidebar, theme toggle, notifications
│   │   ├── reports/        # Clause statistics, filters, recommendations
│   │   └── ui/             # Core shadcn primitives (Button, Dialog, Sheet, etc.)
│   ├── context/            # AuthContext & global state providers
│   ├── hooks/              # Custom hooks (useDocuments, useJobProgress, useScrollLock)
│   ├── services/           # Backend API connectors (auth, compliance, documents, etc.)
│   ├── styles/             # Design tokens (colors, typography, shadows, animations)
│   ├── types/              # TypeScript models and API interfaces
│   └── utils/              # Auth storage, role helpers, and formatting utilities
├── .env.example            # Environment configuration template
├── next.config.ts          # Next.js compiler & build configuration
├── package.json            # Node scripts & dependencies
└── tsconfig.json           # TypeScript configuration
```

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local`:

```bash
# Windows PowerShell:
Copy-Item .env.example .env.local

# Linux / macOS:
cp .env.example .env.local
```

Default configuration:
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000
```

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the application.

---

## Available Scripts

- `npm run dev`: Starts the local development server with Turbopack on port 3000.
- `npm run build`: Generates an optimized production build and checks TypeScript types.
- `npm run start`: Runs the built production server.
- `npm run lint`: Runs ESLint across the codebase.
