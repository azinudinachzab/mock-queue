const { PrismaClient } = require('@prisma/client');
const branches = require('../src/data/branches');
const services = require('../src/data/services');
const salesAgents = require('../src/data/salesAgents');
const counters = require('../src/data/counters');

const prisma = new PrismaClient();

async function main() {
  const operatingDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');

  for (const service of services) {
    await prisma.service.upsert({
      where: { code: service.code },
      update: service,
      create: service,
    });
  }

  for (const branch of branches) {
    const seededBranch = await prisma.branch.upsert({
      where: { code: branch.code },
      update: branch,
      create: branch,
    });

    await prisma.branchQueueDay.upsert({
      where: {
        branchCode_operatingDate: {
          branchCode: seededBranch.code,
          operatingDate,
        },
      },
      update: { status: 'open' },
      create: {
        branchCode: seededBranch.code,
        operatingDate,
        status: 'open',
      },
    });
  }

  for (const agent of salesAgents) {
    const branch = await prisma.branch.findUnique({ where: { code: agent.branchCode } });
    await prisma.salesAgent.upsert({
      where: { employeeId: agent.employeeId },
      update: { agentName: agent.agentName, status: agent.status, branchId: branch.id },
      create: { employeeId: agent.employeeId, agentName: agent.agentName, status: agent.status, branchId: branch.id },
    });
  }

  for (const counter of counters) {
    const branch = await prisma.branch.findUnique({ where: { code: counter.branchCode } });
    const seededCounter = await prisma.counter.upsert({
      where: { counterCode: counter.counterCode },
      update: { counterName: counter.counterName, status: counter.status, branchId: branch.id },
      create: { counterCode: counter.counterCode, counterName: counter.counterName, status: counter.status, branchId: branch.id },
    });
    const agent = await prisma.salesAgent.findFirst({ where: { branchId: branch.id, status: 'active' } });
    if (agent) {
      const assignment = await prisma.counterAssignment.findFirst({
        where: { counterId: seededCounter.id, salesAgentId: agent.id, status: 'active', unassignedAt: null },
      });
      if (!assignment) {
        await prisma.counterAssignment.create({
          data: { counterId: seededCounter.id, salesAgentId: agent.id, assignedAt: new Date(), status: 'active' },
        });
      }
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
