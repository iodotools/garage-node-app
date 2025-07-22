const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = {
      id: decoded.sub,
      roles: decoded.roles,
      permissions: decoded.permissions
    };

    const revokedToken = await prisma.revokedToken.findFirst({
      where: { token },
    });

    if (revokedToken) {
      return res.status(401).json({ message: 'Token has been revoked' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const hasRole = (role) => {
  return async (req, res, next) => {
    if (!req.user?.roles.includes(role)) {
      return res.status(403).json({ message: 'Insufficient role' });
    }
    next();
  };
};

const hasPermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user?.permissions.includes(permission)) {
      return res.status(403).json({ message: 'Insufficient permission' });
    }
    next();
  };
};


module.exports = {
  authMiddleware,
  hasRole,
  hasPermission
};
