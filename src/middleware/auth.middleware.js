const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../services/auth/auth.service");
const prisma = require("../../lib/prisma");

/**
 * Middleware de autenticação que verifica o token JWT
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Authentication token is required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const revokedToken = await prisma.revokedToken.findFirst({
      where: { token },
    });
    if (revokedToken) {
      return res.status(401).json({ message: "Token has been revoked" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.sub,
      roles: decoded.roles,
      permissions: decoded.permissions
    };
    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/**
 * Middleware que verifica se o usuário tem uma role específica
 */
const hasRole = (role) => {
  return async (req, res, next) => {
    if (!req.user?.roles.includes(role)) {
      return res.status(403).json({ message: "Insufficient role" });
    }
    next();
  };
};

/**
 * Middleware que verifica se o usuário tem uma permissão específica
 */
const hasPermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user?.permissions.includes(permission)) {
      return res.status(403).json({ message: "Insufficient permission" });
    }
    next();
  };
};

// Exportar como objeto para manter retrocompatibilidade com importações existentes
module.exports = authMiddleware;
// Também exportar funções individuais para permitir importação desestruturada
module.exports.authMiddleware = authMiddleware;
module.exports.hasRole = hasRole;
module.exports.hasPermission = hasPermission;
