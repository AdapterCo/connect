const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function initializeDatabase() { await prisma.$connect(); }
module.exports = { prisma, initializeDatabase };
