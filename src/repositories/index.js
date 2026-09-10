const { createMemoryRepository } = require('./memoryRepository');
const { createPrismaRepository } = require('./prismaRepository');

function createRepository(options = {}) {
  if (options.repository) return options.repository;
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = options.prisma || new PrismaClient();
    return createPrismaRepository(prisma);
  }
  return createMemoryRepository();
}

module.exports = { createRepository };
