const { PrismaClient } = require('@prisma/client');
const branches = require('../src/data/branches');

const prisma = new PrismaClient();

async function main() {
  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { code: branch.code },
      update: branch,
      create: branch,
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
