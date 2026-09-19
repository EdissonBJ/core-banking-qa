import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const JWT_SECRET =
  process.env.JWT_SECRET ?? "local_dev_only_not_a_real_secret";

export interface AuthedRequest extends Request {
  user?: { id: string; email: string };
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Falta el token de autenticación" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      email: string;
    };
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Token inválido o expirado" });
  }
}
