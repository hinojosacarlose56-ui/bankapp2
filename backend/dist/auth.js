"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowRoles = exports.requireAuth = exports.verifyToken = exports.signToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const store_1 = require("./store");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const signToken = (payload) => jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: "8h" });
exports.signToken = signToken;
const verifyToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
};
exports.verifyToken = verifyToken;
const requireAuth = (invalidatedTokens) => (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid token" });
    }
    const token = authHeader.slice("Bearer ".length);
    if (invalidatedTokens.has(token)) {
        return res.status(401).json({ error: "Token is invalidated" });
    }
    const decoded = (0, exports.verifyToken)(token);
    if (!decoded) {
        return res.status(401).json({ error: "Missing or invalid token" });
    }
    const user = store_1.staffUsers.find((u) => u.id === decoded.userId && u.isActive);
    if (!user) {
        return res.status(401).json({ error: "Missing or invalid token" });
    }
    req.auth = decoded;
    return next();
};
exports.requireAuth = requireAuth;
const allowRoles = (roles) => (req, res, next) => {
    if (!req.auth) {
        return res.status(401).json({ error: "Missing or invalid token" });
    }
    if (!roles.includes(req.auth.role)) {
        return res.status(403).json({ error: "Forbidden" });
    }
    return next();
};
exports.allowRoles = allowRoles;
