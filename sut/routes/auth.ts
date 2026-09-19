import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db";
import { recordAudit } from "../audit";
import { JWT_SECRET } from "../auth-middleware";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: "INVALID_BODY",
      message: parsed.error.issues.map((i) => i.message).join(", "),
    });
    return;
  }
  const { email, password } = parsed.data;

  const { rows } = await pool.query(
    "SELECT id, email, password_hash, full_name FROM users WHERE email = $1",
    [email]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res
      .status(401)
      .json({ code: "INVALID_CREDENTIALS", message: "Email o contraseña incorrectos" });
    return;
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "15m",
  });

  await recordAudit(pool, {
    actor: user.email,
    action: "auth.login",
    payload: { userId: user.id },
  });

  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, fullName: user.full_name },
  });
});

export default router;
