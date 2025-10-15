const prisma = require("../../lib/prisma");

class AgentsService {
  constructor() {}

  async getAgents(args) {
    const {
      perPage,
      offset,
      orderBy = "created_at",
      orderDirection = "desc",
      status,
      tipo,
      cliente,
    } = args;

    const queryOptions = {
      where: {},
      orderBy: {
        [orderBy]: orderDirection,
      },
      include: {
        _count: {
          select: {
            conteudos_titulo: true,
            conteudos_texto: true,
            conteudos_imagem: true,
          },
        },
      },
    };

    if (status) {
      queryOptions.where.status = status;
    }

    if (tipo) {
      queryOptions.where.tipo = { in: Array.isArray(tipo) ? tipo : [tipo] };
    }

    if (perPage !== undefined) {
      queryOptions.take = perPage;
    }

    if (offset !== undefined) {
      queryOptions.skip = offset;
    }

    if (cliente !== undefined) {
      queryOptions.where.OR = [
        {
          conteudos_titulo: {
            some: {
              cliente: cliente,
            },
          },
        },
        {
          conteudos_texto: {
            some: {
              cliente: cliente,
            },
          },
        },
        {
          conteudos_imagem: {
            some: {
              cliente: cliente,
            },
          },
        },
      ];
    }

    const agents = await prisma.agente.findMany(queryOptions);

    /*formattar no formato   nome_agente: string;
  cliente: string;
  clienteLogo: string;
  conteudos: number;
*/
    const formattedAgents = agents.map((agent) => {
      return {
        id: agent.id_agente,
        name: agent.nome,
        cliente: "DM9",
        clienteLogo: "",
        conteudos:
          agent._count.conteudos_titulo +
          agent._count.conteudos_texto +
          agent._count.conteudos_imagem,
      };
    });

    return formattedAgents;
  }
}

module.exports = { AgentsService };
