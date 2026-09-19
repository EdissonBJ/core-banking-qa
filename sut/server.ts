import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import dotenv from "dotenv";
import authRouter from "./routes/auth";
import accountsRouter from "./routes/accounts";
import transfersRouter from "./routes/transfers";

dotenv.config();

const app = express();
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/transfers", transfersRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(express.static(path.join(__dirname, "public")));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ code: "INTERNAL_ERROR", message: "Error interno del servidor" });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`core-banking-qa SUT escuchando en http://localhost:${PORT}`);
});
