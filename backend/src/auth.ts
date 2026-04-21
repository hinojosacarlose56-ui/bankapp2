import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { customerUsers, staffUsers } from "./store";
import { Role } from "./types";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

type AuthPayload = { userId: string; role: Role; customerId?: string };

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

  if (decoded.role === "customer") {
    const customerUser = customerUsers.find((u) => u.id === decoded.userId && u.isActive);
    if (!customerUser) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }
    req.auth = { ...decoded, customerId: customerUser.customerId };
    return next();
  }

  const staffUser = staffUsers.find((u) => u.id === decoded.userId && u.isActive);
  if (!staffUser) {
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
