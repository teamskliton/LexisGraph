# 12.2 Frontend Project Structure & Folder Organization

---

# 12.2.1 Purpose

The Frontend Project Structure defines the directory organization, module boundaries, file naming conventions, and architectural guidelines for the LexisGraph Next.js application.

A well-defined project structure improves:

- Maintainability
- Scalability
- Code readability
- Team collaboration
- AI-assisted code generation
- Testing
- Reusability

The architecture shall follow a feature-based modular structure while keeping shared resources centralized.

---

# 12.2.2 Architecture Philosophy

The frontend shall adopt a Feature-Based Modular Architecture.

Each business domain shall own:

- Pages
- Components
- Hooks
- API calls
- Types
- Validation
- Utilities

Shared resources shall remain outside feature modules.

This minimizes coupling and improves long-term maintainability.

---

# 12.2.3 Root Directory Structure

```
frontend/

app/

components/

features/

hooks/

lib/

services/

store/

types/

styles/

public/

middleware.ts

next.config.ts

package.json

tsconfig.json

README.md
```

The root directory shall remain uncluttered and contain only application-level configuration.

---

# 12.2.4 App Router Structure

The application shall use the Next.js App Router.

```
app/

layout.tsx

page.tsx

login/

register/

dashboard/

policies/

reports/

analysis/

settings/

admin/

not-found.tsx

loading.tsx

error.tsx
```

Every route shall represent a user-facing page.

---

# 12.2.5 Feature Modules

Business logic shall be organized by feature.

```
features/

auth/

dashboard/

policies/

reports/

analysis/

organization/

knowledge/

users/

admin/
```

Each feature owns its implementation.

---

# 12.2.6 Feature Directory Structure

Example

```
features/

policies/

components/

hooks/

services/

schemas/

types/

utils/

constants/

index.ts
```

Responsibilities

Components

Reusable UI specific to the feature

Hooks

Business-related React hooks

Services

API communication

Schemas

Zod validation

Types

TypeScript interfaces

Utils

Helper functions

Constants

Feature-specific constants

---

# 12.2.7 Shared Components

Reusable UI components shall be stored separately.

```
components/

ui/

layout/

navigation/

forms/

tables/

charts/

dialogs/

upload/

feedback/

common/
```

These components shall remain independent of business logic.

---

# 12.2.8 Layout Components

The layout module shall contain:

```
components/layout/

Sidebar

Navbar

Header

Footer

Breadcrumbs

PageContainer

ContentLayout
```

Layouts shall provide a consistent user experience.

---

# 12.2.9 UI Components

The `ui` directory shall wrap or extend shadcn/ui components.

Examples

```
Button

Card

Input

Textarea

Dialog

Dropdown

Table

Badge

Tabs

Alert

Tooltip

Skeleton
```

Custom styling shall remain centralized.

---

# 12.2.10 API Services

REST API communication shall be isolated.

```
services/

api.ts

auth.ts

policy.ts

report.ts

analysis.ts

organization.ts

dashboard.ts
```

Components shall never make direct fetch requests.

---

# 12.2.11 Hooks

Custom hooks shall encapsulate reusable logic.

Examples

```
useAuth()

usePolicies()

useReports()

useAnalysis()

useUpload()

useDashboard()

useCurrentUser()
```

Hooks shall compose API services and state management.

---

# 12.2.12 State Management

Global state shall be minimal.

```
store/

auth.ts

theme.ts

notifications.ts

organization.ts
```

Guidelines

Server state

TanStack Query

Client UI state

Zustand

Local component state

React useState

---

# 12.2.13 Utility Modules

```
lib/

api-client.ts

auth.ts

formatters.ts

validators.ts

date.ts

permissions.ts

constants.ts
```

Utilities shall remain framework-independent where possible.

---

# 12.2.14 Type Definitions

Shared interfaces

```
types/

user.ts

organization.ts

policy.ts

report.ts

analysis.ts

api.ts

pagination.ts
```

Feature-specific types shall remain inside feature folders when not reused elsewhere.

---

# 12.2.15 Form Validation

Validation shall use:

React Hook Form

+

Zod

Validation schemas shall reside inside:

```
features/*/schemas/
```

Validation rules shall match backend validation.

---

# 12.2.16 File Naming Conventions

Components

```
PolicyCard.tsx

UploadDialog.tsx

ComplianceChart.tsx
```

Hooks

```
usePolicies.ts

useReports.ts
```

Utilities

```
formatDate.ts

calculateRisk.ts
```

Types

```
policy.ts

report.ts
```

Constants

```
constants.ts
```

File names shall use PascalCase for React components and camelCase for utility files.

---

# 12.2.17 Import Strategy

Absolute imports shall be preferred.

Example

```ts
import { Button } from "@/components/ui/button";
import { usePolicies } from "@/features/policies/hooks/usePolicies";
```

Deep relative imports shall be avoided.

---

# 12.2.18 Dependency Rules

Allowed

```
Pages

↓

Features

↓

Services

↓

API
```

Not Allowed

```
Feature A

↓

Feature B

↓

Feature A
```

Circular dependencies shall be prohibited.

---

# 12.2.19 Code Organization Rules

Each file shall have a single responsibility.

Business logic shall remain outside UI components.

Components should be composable.

Avoid files exceeding approximately 300–400 lines where practical by extracting reusable logic.

Duplicate logic shall be extracted into hooks or utilities.

---

# 12.2.20 Testing Structure

```
tests/

components/

features/

integration/

e2e/
```

Feature modules may also include co-located test files when appropriate.

---

# 12.2.21 Future Scalability

The structure shall support:

Micro-frontends (future)

Plugin architecture

Internationalization

White-label deployments

Multiple themes

Progressive Web App support

Offline functionality

---

# 12.2.22 Acceptance Criteria

The Frontend Project Structure shall be considered complete when:

✓ Feature-based organization is implemented.

✓ Shared UI components are centralized.

✓ API services are isolated.

✓ State management follows defined responsibilities.

✓ Absolute imports are configured.

✓ Validation schemas are modular.

✓ Circular dependencies are prevented.

✓ Project structure supports future expansion.

---

# 12.2.23 Summary

The Frontend Project Structure establishes a scalable and maintainable architecture for the LexisGraph application. By organizing code around business features, centralizing shared resources, isolating API communication, and enforcing clear dependency boundaries, the frontend remains easy to extend, test, and evolve while supporting efficient collaboration and AI-assisted development.

---

End of Section 12.2