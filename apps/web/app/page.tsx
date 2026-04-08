import { prisma } from "@repo/db"

export default async function Home() {
  const users = await prisma.user.findMany();

  return (
    <div>
      {users.map((user) => (
        <div key={user.id}>
          <p>user - {user?.username} password - {user?.password}</p>
        </div>
      ))}

      <h1>Welcome to Next.js!</h1>
      <h1>Hello Aary and Sharvil</h1>
    </div>
  );
}

