Prisma with turborepo docs (https://www.prisma.io/docs/guides/deployment/turborepo)
Notion guide link (https://www.notion.so/Prisma-setup-in-Turborepo-copy-paste-guide-33900f9b022980809109daabb54b060e?source=copy_link)

# Turborepo Setup Guide — `week-25-cicd-turborepo`

A step-by-step guide to how this monorepo was assembled from scratch, with explanations for every decision.

---

## 📁 Project Structure

```
week-25-cicd-turborepo/
├── apps/
│   ├── web/          ← Next.js frontend (pre-created by Turborepo)
│   ├── http-server/  ← Express REST API
│   └── ws-server/    ← WebSocket server
├── packages/
│   ├── prisma/       ← Shared database package (@repo/db)
│   ├── ui/           ← Shared UI components (pre-created)
│   ├── eslint-config/       ← Shared ESLint config (pre-created)
│   └── typescript-config/   ← Shared TypeScript config (pre-created)
├── package.json       ← Root config — runs turbo commands
├── pnpm-workspace.yaml
└── turbo.json         ← Defines build pipeline and task dependencies
```

> **Why a monorepo?** All apps share code (types, DB client, configs) from `packages/`. Without a monorepo, you'd duplicate this code or publish it to npm. With Turborepo + pnpm workspaces, packages are linked locally and builds run in the correct order automatically.

---

## Step 1 — Create App Folders

Inside `apps/`, manually create two empty folders:

- `http-server/`
- `ws-server/`

The `web/` folder already exists (created by the Turborepo CLI when the project was initialized).

---

## Step 2 — Set Up the Shared Database Package (`@repo/db`)

This package wraps Prisma and exposes a single `prisma` client instance that any app can import. It lives in `packages/prisma/`.

### 2a. Initialize the package

```bash
cd packages/prisma
pnpm init -y
```

Then update `package.json` to match the following. Every field matters:

```json
{
  "type": "module",
  "name": "@repo/db",
  "version": "1.0.0",
  "description": "",
  "main": "dist/src/index.js",
  "scripts": {
    "build": "tsc -b",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "prisma": "^7.6.0",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "@prisma/adapter-neon": "^7.6.0",
    "@prisma/client": "^7.6.0",
    "dotenv": "^17.4.0"
  },
  "exports": {
    ".": {
      "import": "./dist/src/index.js",
      "types": "./dist/src/index.d.ts"
    }
  }
}
```

> **Why `"type": "module"`?** This tells Node.js to treat `.js` files as ES Modules (using `import/export`), which is required for the Prisma Neon adapter.
>
> **Why `"exports"` instead of just `"main"`?** The `exports` field is the modern standard. It lets you define separate paths for ESM (`import`) and TypeScript types (`types`), giving consumers the correct files automatically.
>
> **Why `workspace:*`?** This is pnpm's way of linking a local package. `@repo/typescript-config` lives in `packages/typescript-config/` — `workspace:*` means "use whatever version is in this monorepo" instead of downloading from npm.

### 2b. Create `tsconfig.json`

Create `packages/prisma/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src", "generated"],
  "exclude": ["node_modules", "dist"]
}
```

> **Why `rootDir: "."`?** The Prisma client is generated into `generated/prisma/`, which is outside `src/`. If `rootDir` were `./src`, TypeScript would error because it imports files outside that directory. Setting `rootDir: "."` covers both `src/` and `generated/`.
>
> **Why `include: ["src", "generated"]`?** TypeScript only compiles the files you explicitly tell it to. We need both our source code (`src/`) and the Prisma-generated client (`generated/`) to be compiled into `dist/`.
>
> **Why `declaration: true`?** This generates `.d.ts` type definition files alongside the compiled JavaScript, so other apps in the monorepo get full TypeScript type checking when they import `@repo/db`.

### 2c. Initialize Prisma

Follow the [Prisma Turborepo guide](https://www.prisma.io/docs/guides/deployment/turborepo), with one change: use `adapter-neon` (for Neon serverless Postgres) instead of `adapter-pg`.

```bash
# From packages/prisma
npx prisma init
```

This creates:

- `prisma/schema.prisma` — define your database schema here
- `.env` — add your `DATABASE_URL` here (Neon connection string)

Also create `prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
```

### 2d. Create `src/client.ts`

This file creates a single Prisma client instance and stores it on `globalThis` in development to prevent creating multiple connections during hot reloads.

```ts
// packages/prisma/src/client.ts
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDir, "../../.env");
dotenv.config({ path: envPath });

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL
});

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

> **Why `.js` extension on the import?** The `base.json` tsconfig uses `"moduleResolution": "NodeNext"`. In this mode, Node.js resolves imports literally at runtime — you must write `.js` even in TypeScript files (TypeScript understands this and maps it to the `.ts` source during compilation).

### 2e. Create `src/index.ts`

This is the public entry point — everything an app needs is re-exported from here.

```ts
// packages/prisma/src/index.ts
export { prisma } from "./client.js"; // the prisma client instance
export * from "../generated/prisma/client.js"; // all generated types (User, Post, etc.)
```

### 2f. Generate the Prisma Client

After defining your schema, run:

```bash
pnpm db:generate
# or from root:
pnpm --filter @repo/db db:generate
```

This populates `packages/prisma/generated/prisma/` with the typed client.

### 2g. Build the package

```bash
pnpm --filter @repo/db build
# or from packages/prisma:
pnpm build
```

This compiles TypeScript to `dist/` so other apps can import it.

> **Important:** You must re-run this build any time you change code in `packages/prisma/src/`. Apps import the compiled `dist/` output, not the raw `.ts` source.

---

## Step 3 — Set Up `http-server`

### 3a. Initialize

```bash
cd apps/http-server
npm init -y
```

Replace the generated `package.json` with:

```json
{
  "type": "module",
  "name": "http-server",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc -b",
    "start": "node dist/index.js",
    "dev": "npm run build && npm run start"
  },
  "devDependencies": {
    "@repo/db": "workspace:*",
    "@repo/typescript-config": "workspace:*"
  },
  "dependencies": {
    "express": "^5.2.1",
    "@types/express": "^5.0.6"
  }
}
```

> **Why `@repo/db` in devDependencies?** It's a package from within the monorepo — not published to npm. Listing it with `workspace:*` tells pnpm to symlink it from `packages/prisma/`. At runtime the compiled code already has everything bundled, so it doesn't need to be in `dependencies`.

### 3b. Create `tsconfig.json`

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}
```

> For apps (unlike `@repo/db`), all source files live inside `src/` — so `rootDir: "./src"` is clean and correct here.

### 3c. Create `src/index.ts`

```ts
import express from "express";
import { prisma } from "@repo/db";

const app = express();
app.use(express.json());

app.get("/", async (req, res) => {
  // Example: const users = await prisma.user.findMany();
  res.json({ message: "HTTP server is running!" });
});

app.listen(3000, () => {
  console.log("HTTP server running on PORT 3000");
});
```

### 3d. Install dependencies and run

```bash
# From the repo root
pnpm install
npm run dev --prefix apps/http-server
```

---

## Step 4 — Set Up `ws-server`

Follow the exact same steps as Step 3, with these differences:

- `"name": "ws-server"` in `package.json`
- Install `ws` instead of `express`:
  ```json
  "dependencies": {
    "ws": "^8.0.0",
    "@types/ws": "^8.0.0"
  }
  ```
- Use a WebSocket server in `src/index.ts` instead of Express
- Change the port (e.g., `8080`)

The `tsconfig.json` is identical to `http-server`.

---

## Step 5 — Running Everything Together

From the **repo root**, run all apps at once using Turbo:

```bash
pnpm dev
```

Turbo reads `turbo.json` and starts all `dev` tasks in parallel. It automatically ensures `@repo/db` is built before the apps that depend on it (because of `"dependsOn": ["^build"]` in the pipeline).

To run the DB commands from root:

```bash
pnpm --filter @repo/db db:migrate   # run migrations
pnpm --filter @repo/db db:generate  # regenerate prisma client
```

---

## ⚠️ Common Gotchas

| Problem                               | Cause                                   | Fix                                                            |
| ------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| `Cannot find module '@repo/db'`       | Package not built yet                   | Run `pnpm --filter @repo/db build`                             |
| `ERR_MODULE_NOT_FOUND` for `./client` | Missing `.js` extension in imports      | All relative imports need `.js` with `NodeNext` resolution     |
| Types from `@repo/db` not working     | `declaration: true` missing in tsconfig | Ensure `packages/prisma/tsconfig.json` has `declaration: true` |
| Prisma client not found               | `prisma generate` not run               | Run `pnpm --filter @repo/db db:generate`                       |



////nginx
write in ( sudo /etc/nginx/nginx.conf ) of production


events {
    # Event directives...
}

http {
	server {
    listen 80;
    server_name ws.pratik.codes;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
	}

	server {
    listen 80;
    server_name http.pratik.codes;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
	}

	server {
    listen 80;
    server_name fe.pratik.codes;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
	}
}


// ---------------------------------------------------------------------------

////nginx
write in ( sudo /etc/nginx/nginx.conf ) of dev


events {
    # Event directives...
}

http {
	server {
    listen 80;
    server_name dev.ws.pratik.codes;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
	}

	server {
    listen 80;
    server_name dev.http.pratik.codes;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
	}

	server {
    listen 80;
    server_name dev.fe.pratik.codes;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
	}
}