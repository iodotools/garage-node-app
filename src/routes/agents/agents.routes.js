const { Router } = require("express");

const { AgentsService } = require("../../services/agents/agents.service");
const authMiddleware = require("../../middleware/auth.middleware");

const agentsRouter = Router();
const agentsService = new AgentsService();

agentsRouter.get("/get-agents", authMiddleware, async (req, res, next) => {
  try {
    const args = {
      perPage: 6,
      offset: 0,
      orderBy: "created_at",
      orderDirection: "desc",
      cliente: req.query.cliente || 1,
      tipo: req.query.tipo || null,
    };
    const agents = await agentsService.getAgents(args);
    res.status(200).json({ agents });
  } catch (error) {
    next(error);
  }
});

module.exports = { agentsRouter };
