const { Worker } = require('bullmq');
const emailService = require('../lib/emailService');

// BullMQ requires its own connection config with maxRetriesPerRequest: null
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
};

const emailWorker = new Worker('email', async (job) => {
  const { orderId, userEmail, orderData } = job.data;
  await emailService.sendOrderConfirmation({
    to: userEmail,
    orderId,
    order: orderData
  });
}, {
  connection,
  concurrency: 5
});

emailWorker.on('completed', (job) => {
  console.log(`[EmailWorker] Job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[EmailWorker] Job ${job.id} failed:`, err.message);
});

module.exports = emailWorker;
