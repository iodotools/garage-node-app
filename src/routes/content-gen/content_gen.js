const { Router } = require("express");

const {
  ContentGenService,
} = require("../../services/content_gen/content_gen.service");
const authMiddleware = require("../../middleware/auth.middleware");

const contenGenRouter = Router();
const contentGenService = new ContentGenService();

contenGenRouter.get(
  "/get-pending-content",
  authMiddleware,
  async (req, res, next) => {
    try {
      const user = req.user;
      const processingContent = await contentGenService.getPendingContent(user);
      res.status(200).json({ processingContent });
    } catch (error) {
      next(error);
    }
  }
);

contenGenRouter.get(
  "/ultimos-conteudos",
  authMiddleware,
  async (req, res, next) => {
    try {
      const args = {
        perPage: 6,
        offset: 0,
        orderBy: "criado_em",
        orderDirection: "desc",
      };

      const content = await contentGenService.getContent(args);

      res.status(200).json({ content });
    } catch (error) {
      next(error);
    }
  }
);

contenGenRouter.get(
  "/content/:uuid",
  authMiddleware,
  async (req, res, next) => {
    try {
      const uuid = req.params.uuid;

      const content = await contentGenService.getContentByUuid(uuid);

      res.status(200).json({ content });
    } catch (error) {
      next(error);
    }
  }
);

contenGenRouter.post(
  "/finaliza-conteudo",
  authMiddleware,
  async (req, res, next) => {
    try {
      const data = req.body;

      const content = await contentGenService.finalizaConteudo(data);

      res.status(200).json({ content });
    } catch (error) {
      next(error);
    }
  }
);

contenGenRouter.get(
  "/download-itens/:uuid",
  authMiddleware,
  async (req, res, next) => {
    try {
      const uuid = req.params.uuid;

      const contentDownload = await contentGenService.downloadItens(uuid);

      res.status(200).json({ contentDownload });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = { contenGenRouter };
