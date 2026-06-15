/**
 * Simulated Email Service
 * 
 * In a real application, this would send emails via SMTP or an API.
 * This implementation includes a realistic delay to simulate network latency.
 */

const sendConfirmation = async (orderId, userEmail) => {
    // [INTENTIONAL PERFORMANCE PROBLEM]
    // Simulate real SMTP latency and external API call.
    // 300ms - 800ms of random delay creates significant response time bottlenecks.
    const delay = 300 + Math.random() * 500;
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    console.log(`[Email Service] Sent order confirmation for #${orderId} to ${userEmail} (${Math.round(delay)}ms)`);
    
    return true;
};

/**
 * sendOrderConfirmation is the BullMQ worker-compatible version.
 * Accepts a job data object { to, orderId, order }.
 */
const sendOrderConfirmation = async ({ to, orderId, order }) => {
    return sendConfirmation(orderId, to);
};

module.exports = {
    sendConfirmation,
    sendOrderConfirmation
};
