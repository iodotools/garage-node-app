const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Exemplo de inserção de dados
  const example = await prisma.example.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Hello World Example'
    }
  });

  console.log('Seed completed successfully');
  console.log('Created example:', example);
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
