const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../services/auth/auth.service");
const prisma = require("../../lib/prisma");

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

    console.log("using:" + JWT_SECRET);

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;
