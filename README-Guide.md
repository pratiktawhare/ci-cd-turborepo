# Steps what I have done here.
1. created simple folders http-server and ws-server, web is already a next-application.
2. created simple prisma folder in packages.
3. cd packages/prisma
4. pnpm init -y and then update "name": "@repo/db" in package.json
5. manually created tsconfig.json
6. write in tsconfig.json ( 
  {
  "extends": "@repo/typescript-config/base.json",
  }
)

Also add "@repo/typescript-config": "workspace:*" in the devDependencies in the package.json

7. initialized prisma with the help of docs: (https://www.prisma.io/docs/prisma-orm/quickstart/prisma-postgres)   (tip: just write adapter-neon intead of adapter-pg and replace pg with neon whereever you see)
8. add this in package.json
  "exports": {
    "./client": "./lib/prisma.ts"
  }

Now you can import client to any of the applications with this line :
import { client } from "@repo/db/client"
Before that you have to add "@repo/db": "workspace:*" in devDependencies in the package.json of that application.


Note: In the docs "prisma" is used as variable to export instead of "client". You can use any one of them.