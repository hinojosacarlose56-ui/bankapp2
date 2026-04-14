import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { staffUsers } from "./store";
import { Role } from "./types";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

type AuthPayload = { userId: string; role: Role };

export interface AuthenticatedRequest extends Request {
  auth?: AuthPayload;
}

export const signToken = (payload: AuthPayload): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });

export const verifyToken = (token: string): AuthPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
};

export const requireAuth = (
  invalidatedTokens: Set<string>,
) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const token = authHeader.slice("Bearer ".length);
  if (invalidatedTokens.has(token)) {
    return res.status(401).json({ error: "Token is invalidated" });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const user = staffUsers.find((u) => u.id === decoded.userId && u.isActive);
  if (!user) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  req.auth = decoded;
  return next();
};

export const allowRoles =
  (roles: Role[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }

    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
