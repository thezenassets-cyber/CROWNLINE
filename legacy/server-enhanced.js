// ============================================
// ENHANCED SERVER WITH EMAIL, EXPORT & USERS
// ============================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer'); // Email integration
const { Parser } = require('json2csv'); // CSV conversion

const app = express();
const PORT = 3000;

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// ==================== DATA PATHS ====================
const dataDir = path.join(__dirname, 'data');
const visitorsFile = path.join(dataDir, 'visitors.json');
const shipmentsFile = path.join(dataDir, 'shipments.json');
const auditLogFile = path.join(dataDir, 'audit-log.json');
const usersFile = path.join(dataDir, 'users.json');
const contactSubmissionsFile = path.join(dataDir, 'contact-submissions.json');
const paymentsFile = path.join(dataDir, 'payments.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// ==================== EMAIL CONFIGURATION ====================
// Configure your email service here
const emailConfig = {
    service: 'gmail', // or your email service
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'your-app-password' // Use app-specific password
    }
};

// Create email transporter
const transporter = nodemailer.createTransport(emailConfig);

// Function to send emails
async function sendEmail(to, subject, html, attachments = []) {
    try {
        const info = await transporter.sendMail({
            from: emailConfig.auth.user,
            to,
            subject,
            html,
            attachments
        });
        console.log('Email sent:', info.response);
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
}

// ==================== DATA INITIALIZATION ====================
function initializeDataFiles() {
    if (!fs.existsSync(visitorsFile)) {
        fs.writeFileSync(visitorsFile, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(auditLogFile)) {
        fs.writeFileSync(auditLogFile, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(contactSubmissionsFile)) {
        fs.writeFileSync(contactSubmissionsFile, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(paymentsFile)) {
        fs.writeFileSync(paymentsFile, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(usersFile)) {
        const defaultUsers = [
            {
                id: 'admin-001',
                username: 'admin',
                email: 'admin@example.com',
                role: 'admin',
                password: 'ChangeMeLocalOnly', // In production, hash this!
                createdAt: new Date().toISOString()
            }
        ];
        fs.writeFileSync(usersFile, JSON.stringify(defaultUsers, null, 2));
    }
    if (!fs.existsSync(shipmentsFile)) {
        const defaultShipments = [
            { id: 'LX-2026-001234', origin: 'Shanghai', destination: 'Rotterdam', type: 'Ocean Freight', status: 'In Transit', progress: 65, eta: '2026-03-10', customer: 'TechCorp Inc', weight: '50 tons', value: '$150,000' },
            { id: 'LX-2026-005678', origin: 'LA', destination: 'Singapore', type: 'Air Cargo', status: 'Processing', progress: 15, eta: '2026-02-28', customer: 'GlobalTrade Ltd', weight: '2.5 tons', value: '$75,000' },
            { id: 'LX-2026-009012', origin: 'Dubai', destination: 'Miami', type: 'Ground Transport', status: 'Delivered', progress: 100, eta: '2026-02-22', customer: 'RetailGlobal Inc', weight: '15 tons', value: '$45,000' },
            { id: 'LX-2026-003456', origin: 'Rotterdam', destination: 'New York', type: 'Ocean Freight', status: 'Loading', progress: 30, eta: '2026-03-15', customer: 'ManufactureCorp', weight: '80 tons', value: '$200,000' },
            { id: 'LX-2026-007890', origin: 'Frankfurt', destination: 'Tokyo', type: 'Air Cargo', status: 'In Flight', progress: 72, eta: '2026-02-25', customer: 'TechVenture Inc', weight: '1.2 tons', value: '$120,000' }
        ];
        fs.writeFileSync(shipmentsFile, JSON.stringify(defaultShipments, null, 2));
    }
}

// ==================== AUDIT LOGGING ====================
function logAudit(action, details, adminId = 'system') {
    const auditLog = JSON.parse(fs.readFileSync(auditLogFile, 'utf8'));
    auditLog.push({
        timestamp: new Date().toISOString(),
        action,
        details,
        adminId,
        userId: adminId
    });
    fs.writeFileSync(auditLogFile, JSON.stringify(auditLog, null, 2));
}

// ==================== VISITOR TRACKING ====================
function trackVisitor(req) {
    const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));
    visitors.push({
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.path,
        country: 'Unknown'
    });
    fs.writeFileSync(visitorsFile, JSON.stringify(visitors, null, 2));
}

// Track all public visits (except admin)
app.use((req, res, next) => {
    if (!req.path.startsWith('/api/admin') && req.path !== '/admin.html' && 
        !req.path.includes('.json') && !req.path.includes('.css') && 
        !req.path.includes('.js') && req.path !== '/') {
        trackVisitor(req);
    }
    next();
});

// ==================== ADMIN AUTHENTICATION ====================
function verifyAdminToken(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (token === 'ChangeMeLocalOnly') { // In production, verify against user database
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// ==================== PUBLIC API ====================

// Get shipment tracking info
app.get('/api/track/:shipmentId', (req, res) => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    const shipment = shipments.find(s => s.id === req.params.shipmentId);
    res.json(shipment || { error: 'Shipment not found' });
});

// Submit contact form with email
app.post('/api/contact', async (req, res) => {
    const { name, email, company, service, message } = req.body;

    // Validate input
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Save submission to JSON
    const submissions = JSON.parse(fs.readFileSync(contactSubmissionsFile, 'utf8'));
    const submission = {
        id: `CONTACT-${Date.now()}`,
        name,
        email,
        company,
        service,
        message,
        timestamp: new Date().toISOString(),
        status: 'new'
    };
    submissions.push(submission);
    fs.writeFileSync(contactSubmissionsFile, JSON.stringify(submissions, null, 2));

    // Send confirmation email to customer
    const customerEmailHtml = `
        <h2>Thank You, ${name}!</h2>
        <p>We received your inquiry about <strong>${service}</strong>.</p>
        <p>Our team will contact you within 24 hours at ${email}.</p>
        <hr>
        <p><strong>Your Message:</strong></p>
        <p>${message}</p>
        <hr>
        <p>Best regards,<br>LIVEXPRESS Team</p>
    `;

    // Send admin notification
    const adminEmailHtml = `
        <h3>New Contact Form Submission</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
        <p><strong>ID:</strong> ${submission.id}</p>
        <p><strong>Time:</strong> ${submission.timestamp}</p>
    `;

    // Send emails
    await sendEmail(email, 'We Received Your Inquiry - LIVEXPRESS', customerEmailHtml);
    await sendEmail(process.env.ADMIN_EMAIL || 'admin@example.com', 'New Contact Submission', adminEmailHtml);

    res.json({ success: true, id: submission.id });
});

// ==================== ADMIN API ====================

// Get visitor analytics
app.get('/api/admin/visitors', verifyAdminToken, (req, res) => {
    const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));
    const today = new Date().toDateString();
    const todayVisitors = visitors.filter(v => new Date(v.timestamp).toDateString() === today);

    res.json({
        recentVisitors: visitors.slice(-10).reverse(),
        todayVisitors: todayVisitors.length,
        totalVisitors: visitors.length
    });
});

// Get admin stats
app.get('/api/admin/stats', verifyAdminToken, (req, res) => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));

    const inTransit = shipments.filter(s => s.status === 'In Transit' || s.status === 'Loading' || s.status === 'In Flight').length;
    const delivered = shipments.filter(s => s.status === 'Delivered').length;
    const cancelled = shipments.filter(s => s.status === 'Cancelled').length;

    res.json({
        totalShipments: shipments.length,
        inTransit,
        delivered,
        cancelled,
        totalVisitors: visitors.length,
        todayVisitors: visitors.filter(v => new Date(v.timestamp).toDateString() === new Date().toDateString()).length
    });
});

// Get all shipments
app.get('/api/admin/shipments', verifyAdminToken, (req, res) => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    res.json(shipments);
});

// Update shipment status
app.post('/api/admin/shipments/:id/status', verifyAdminToken, (req, res) => {
    const { status } = req.body;
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    const shipment = shipments.find(s => s.id === req.params.id);

    if (shipment) {
        shipment.status = status;
        fs.writeFileSync(shipmentsFile, JSON.stringify(shipments, null, 2));
        logAudit('UPDATE_SHIPMENT_STATUS', { shipmentId: req.params.id, newStatus: status }, req.headers['x-admin-id']);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Shipment not found' });
    }
});

// Update delivery progress
app.post('/api/admin/shipments/:id/delivery', verifyAdminToken, (req, res) => {
    const { progress, eta } = req.body;
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    const shipment = shipments.find(s => s.id === req.params.id);

    if (shipment) {
        shipment.progress = progress;
        shipment.eta = eta;
        fs.writeFileSync(shipmentsFile, JSON.stringify(shipments, null, 2));
        logAudit('UPDATE_DELIVERY', { shipmentId: req.params.id, progress, eta }, req.headers['x-admin-id']);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Shipment not found' });
    }
});

// Cancel shipment
app.post('/api/admin/shipments/:id/cancel', verifyAdminToken, (req, res) => {
    const { reason } = req.body;
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    const shipment = shipments.find(s => s.id === req.params.id);

    if (shipment) {
        shipment.status = 'Cancelled';
        shipment.cancelledReason = reason;
        fs.writeFileSync(shipmentsFile, JSON.stringify(shipments, null, 2));
        logAudit('CANCEL_SHIPMENT', { shipmentId: req.params.id, reason }, req.headers['x-admin-id']);
        
        // Send cancellation email to customer
        const emailHtml = `
            <h3>Shipment Cancelled</h3>
            <p>Shipment <strong>${shipment.id}</strong> has been cancelled.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Route: ${shipment.origin} → ${shipment.destination}</p>
        `;
        sendEmail(process.env.CUSTOMER_EMAIL || 'customer@example.com', 'Shipment Cancelled', emailHtml);

        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Shipment not found' });
    }
});

// Get audit logs
app.get('/api/admin/audit-logs', verifyAdminToken, (req, res) => {
    const logs = JSON.parse(fs.readFileSync(auditLogFile, 'utf8'));
    res.json(logs.slice(-50).reverse()); // Last 50 logs
});

// ==================== CONTACT SUBMISSIONS ====================

// Get all contact submissions
app.get('/api/admin/contact-submissions', verifyAdminToken, (req, res) => {
    const submissions = JSON.parse(fs.readFileSync(contactSubmissionsFile, 'utf8'));
    res.json(submissions.reverse());
});

// Mark submission as handled
app.post('/api/admin/contact-submissions/:id/handle', verifyAdminToken, (req, res) => {
    const submissions = JSON.parse(fs.readFileSync(contactSubmissionsFile, 'utf8'));
    const submission = submissions.find(s => s.id === req.params.id);

    if (submission) {
        submission.status = 'handled';
        fs.writeFileSync(contactSubmissionsFile, JSON.stringify(submissions, null, 2));
        logAudit('HANDLE_CONTACT', { submissionId: req.params.id }, req.headers['x-admin-id']);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Submission not found' });
    }
});

// ==================== CSV EXPORT ====================

// Export shipments as CSV
app.get('/api/admin/export/shipments', verifyAdminToken, (req, res) => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));

    try {
        const parser = new Parser();
        const csv = parser.parse(shipments);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=shipments.csv');
        res.send(csv);

        logAudit('EXPORT_SHIPMENTS', { format: 'CSV', count: shipments.length }, req.headers['x-admin-id']);
    } catch (error) {
        res.status(500).json({ error: 'Export failed' });
    }
});

// Export visitors as CSV
app.get('/api/admin/export/visitors', verifyAdminToken, (req, res) => {
    const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));

    try {
        const parser = new Parser();
        const csv = parser.parse(visitors);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=visitors.csv');
        res.send(csv);

        logAudit('EXPORT_VISITORS', { format: 'CSV', count: visitors.length }, req.headers['x-admin-id']);
    } catch (error) {
        res.status(500).json({ error: 'Export failed' });
    }
});

// Export audit logs as CSV
app.get('/api/admin/export/audit-logs', verifyAdminToken, (req, res) => {
    const logs = JSON.parse(fs.readFileSync(auditLogFile, 'utf8'));

    try {
        const parser = new Parser();
        const csv = parser.parse(logs);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
        res.send(csv);

        logAudit('EXPORT_AUDIT_LOGS', { format: 'CSV', count: logs.length }, req.headers['x-admin-id']);
    } catch (error) {
        res.status(500).json({ error: 'Export failed' });
    }
});

// ==================== USER MANAGEMENT ====================

// Get all users
app.get('/api/admin/users', verifyAdminToken, (req, res) => {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    // Don't send passwords
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt
    }));
    res.json(safeUsers);
});

// Add new user
app.post('/api/admin/users', verifyAdminToken, (req, res) => {
    const { username, email, role } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));

    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    const newUser = {
        id: `user-${Date.now()}`,
        username,
        email,
        role: role || 'manager',
        password: Math.random().toString(36).slice(-8), // Temporary password
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    // Send welcome email
    const welcomeEmail = `
        <h3>Welcome to LIVEXPRESS Admin!</h3>
        <p>Your account has been created.</p>
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Temporary Password:</strong> ${newUser.password}</p>
        <p>Please change your password immediately upon login.</p>
    `;
    sendEmail(email, 'LIVEXPRESS Admin Account Created', welcomeEmail);

    logAudit('CREATE_USER', { username, email, role }, req.headers['x-admin-id']);

    res.json({ success: true, user: { id: newUser.id, username, email, role } });
});

// Delete user
app.delete('/api/admin/users/:id', verifyAdminToken, (req, res) => {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const index = users.findIndex(u => u.id === req.params.id);

    if (index !== -1) {
        const deletedUser = users[index];
        users.splice(index, 1);
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        logAudit('DELETE_USER', { userId: req.params.id, username: deletedUser.username }, req.headers['x-admin-id']);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// ==================== PAYMENT TRACKING ====================

// Record payment
app.post('/api/admin/payments', verifyAdminToken, (req, res) => {
    const { shipmentId, amount, method, status } = req.body;
    const payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf8'));

    const payment = {
        id: `PAY-${Date.now()}`,
        shipmentId,
        amount,
        method,
        status: status || 'pending',
        timestamp: new Date().toISOString()
    };

    payments.push(payment);
    fs.writeFileSync(paymentsFile, JSON.stringify(payments, null, 2));

    logAudit('RECORD_PAYMENT', { shipmentId, amount, method }, req.headers['x-admin-id']);

    res.json({ success: true, payment });
});

// Get payments
app.get('/api/admin/payments', verifyAdminToken, (req, res) => {
    const payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf8'));
    res.json(payments);
});

// ==================== START SERVER ====================
initializeDataFiles();

app.listen(PORT, () => {
    console.log(`🚀 LIVEXPRESS server running on port ${PORT}`);
    console.log(`🌐 Website: http://localhost:${PORT}`);
    console.log(`👨‍💼 Admin: http://localhost:${PORT}/admin.html`);
});

module.exports = app;
