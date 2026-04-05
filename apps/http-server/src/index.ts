import "dotenv/config"; // loads .env into process.env — must be first
import express from "express";
import { prisma } from "@repo/db";

const app = express();
app.use(express.json()); // parses incoming JSON request bodies into req.body

app.get("/", (req, res) => {
  res.send("Hi there");
})

app.post("/signup", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const user = await prisma.user.create({
    data: {
      username,
      password
    }
  })

  res.json({
    message: "Signup Successful",
    id: user.id
  })
})

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`HTTP server running on PORT ${PORT}`)
})
