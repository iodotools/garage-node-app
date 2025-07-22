const { PrismaClient } = require('@prisma/client');

// Evita múltiplas instâncias durante hot reload em desenvolvimento
const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Em ambientes que não sejam de produção, guardar a instância no objeto global
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = prisma;
