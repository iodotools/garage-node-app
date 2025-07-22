const { Router } = require("express");
const { z } = require("zod");
const { AuthService } = require("../../services/auth/auth.service");
const { authMiddleware } = require("../../middleware/auth/auth.middleware");
const { validate } = require("../../middleware/validation.middleware");

const authRouter = Router();
const authService = new AuthService();

// Schemas for validation
const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string(),
    role: z.string().optional(),
    avatar_url: z.string().url().optional(),
    display_name: z.string().optional(),
    gender: z.string().optional(),
    birth_date: z.string().optional(),
    asset_user_id: z.string().optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

const verify2FASchema = z.object({
  body: z.object({
    email: z.string().email(),
    token: z.string().length(6),
  }),
});

const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string(),
  }),
});

//## Endpoint Register
authRouter.post(
  "/register",
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const user = await authService.register(req.body);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }
);

//## Endpoint Login
authRouter.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

//## Endpoint Verify 2FA
authRouter.post(
  "/verify-2fa",
  validate(verify2FASchema),
  async (req, res, next) => {
    try {
      const { email, token } = req.body;
      const tokens = await authService.verifyTwoFactorToken(email, token);
      res.json(tokens);
    } catch (error) {
      next(error);
    }
  }
);

//## Endpoint Refresh Token
authRouter.post(
  "/refresh-token",
  validate(refreshTokenSchema),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

//## Endpoint Logout
authRouter.post("/logout", authMiddleware, async (req, res, next) => {
  try {
    const { refreshToken, accessToken } = req.body;
    await authService.logout(refreshToken, accessToken);
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
});

//## Endpoint Me
authRouter.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const user = await authService.getUser(parseInt(req.user.sub));
    res.json(user);
  } catch (error) {
    next(error);
  }
});

//## Endpoint Check Email
authRouter.get("/check-email", async (req, res, next) => {
  try {
    const { email } = req.query;
    const result = await authService.checkEmailExists(email);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = { authRouter };
