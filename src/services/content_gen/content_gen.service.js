const prisma = require("../../lib/prisma");

class ContentGenService {
  constructor() {}

  async getPendingContent(user) {
    const userId = user.id_user;

    /*TODO FUTURAMENTE VAI TER REGARS PARA O USER VER SÓ O QUE TEM DISPONIVEL */

    const pendingContent = await prisma.conteudo.findMany({
      where: { status: "PENDENTE" },
    });
    return pendingContent;
  }

  async getContent(args) {
    const {
      perPage,
      status,
      offset,
      orderBy = "criado_em",
      orderDirection = "desc",
    } = args;

    const queryOptions = {
      orderBy: { [orderBy]: orderDirection },
    };

    if (status) {
      queryOptions.where = { status };
    }

    if (perPage !== undefined) {
      queryOptions.take = perPage;
    }

    if (offset !== undefined) {
      queryOptions.skip = offset;
    }

    //Sabendo que agente_titulo, agente_texto e agente_imagem são id's de agentes, fazer o join com a tabela agentes
    queryOptions.include = {
      agenteTituloRelation: true,
      agenteTextoRelation: true,
      agenteImagemRelation: true,
    };

    const content = await prisma.conteudo.findMany(queryOptions);

    //formata a reposta para ficar como no modelo de data e juntar os agentes por separados por ,
    const formattedContent = content.map((item) => {
      return {
        dataCriacao: item.criado_em.toISOString().slice(0, 10),
        uuid: item.uuid,
        cliente: "DM9",
        clienteLogo: "",
        identificador: item.name,
        editoria: item.editoria,
        status: item.status,
        agentes:
          item.agenteTextoRelation.nome + ", " + item.agenteTituloRelation.nome,
      };

      /*  item.agenteImagemRelation.nome +
          ", " + */
    });

    return formattedContent;
  }

  async getContentByUuid(uuid) {
    const content = await prisma.conteudo.findFirst({
      where: { uuid },
      include: {
        agenteTituloRelation: true,
        agenteTextoRelation: true,
        agenteImagemRelation: true,
      },
    });
    return content;
  }

  async finalizaConteudo(data) {
    const { content_id, title, content, imageUrl } = data;

    // First find the content by uuid
    const existingContent = await prisma.conteudo.findFirst({
      where: { uuid: content_id },
    });

    if (!existingContent) {
      throw new Error(`Content with uuid ${content_id} not found`);
    }

    // Then update it using its primary key
    const updatedContent = await prisma.conteudo.update({
      where: { id_conteudo: existingContent.id_conteudo },
      data: {
        status: "CONCLUÍDO",
        titulo: title,
        texto: content,
        imagem: imageUrl,
      },
    });

    return updatedContent;
  }

  async downloadItens(uuid) {
    const content = await prisma.conteudo.findFirst({
      where: { uuid },
      include: {
        agenteTituloRelation: true,
        agenteTextoRelation: true,
        agenteImagemRelation: true,
      },
    });

    if (!content) {
      throw new Error(`Content with uuid ${uuid} not found`);
    }

    // Return only the three requested fields with renamed keys
    return {
      title: content.titulo,
      content: content.texto,
      imageUrl: content.imagem,
    };
  }
}

module.exports = { ContentGenService };
