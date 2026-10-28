# ✉️ EMAIL INTEGRATION GUIDE

## Overview
Send automated emails for contact forms, shipment updates, notifications, and confirmations.

---

## **Features**

✅ Contact form email confirmations  
✅ Shipment status updates via email  
✅ SMS notifications (optional)  
✅ Email templates  
✅ Attachments support  
✅ Schedule emails  

---

## **Setup: Gmail SMTP**

### Step 1: Enable Gmail App Password

1. Go to [Google Account](https://myaccount.google.com)
2. Click **Security** (left sidebar)
3. Scroll to "How you sign in to Google"
4. Enable **2-Step Verification**
5. Go back to Security → App Passwords
6. Select **Mail** and **Windows Computer**
7. Copy the **16-character password**

### Step 2: Create .env File

```bash
# .env
GMAIL_USER=your-email@gmail.com
GMAIL_PASSWORD=xxxx xxxx xxxx xxxx
ADMIN_EMAIL=admin@example.com
ADMIN_PHONE=+1234567890
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
NODE_ENV=production
```

### Step 3: Install Nodemailer

```bash
npm install nodemailer dotenv
```

---

## **Implementation**

### Add to server.js

```javascript
require('dotenv').config();
const nodemailer = require('nodemailer');

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD
    }
});

// Email templates
const emailTemplates = {
    contactConfirmation: (name, email, message) => ({
        to: email,
        from: `LIVEXPRESS <${process.env.GMAIL_USER}>`,
        subject: '✅ We received your inquiry - LIVEXPRESS',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #006699 0%, #0088bb 100%); padding: 20px; color: white; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0;">LIVEXPRESS</h1>
                </div>
                <div style="padding: 30px; background: #f8f9fa;">
                    <h2>Hello ${name},</h2>
                    <p>Thank you for reaching out to LIVEXPRESS!</p>
                    <p>We have received your inquiry:</p>
                    <blockquote style="background: white; padding: 15px; border-left: 4px solid #006699; margin: 20px 0;">
                        ${message}
                    </blockquote>
                    <p>Our team will review your request and get back to you within 24 hours.</p>
                    <p>Reference ID: <strong>${Date.now()}</strong></p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">
                        LIVEXPRESS | Connecting the world 🌍<br>
                        Email: ${process.env.ADMIN_EMAIL}<br>
                        Phone: ${process.env.ADMIN_PHONE}
                    </p>
                </div>
            </div>
        `
    }),
    
    adminNotification: (name, email, company, message) => ({
        to: process.env.ADMIN_EMAIL,
        from: `LIVEXPRESS <${process.env.GMAIL_USER}>`,
        subject: `🔔 New Inquiry from ${name}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #006699;">New Inquiry Alert</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Company:</strong> ${company}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
                <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                    <a href="http://localhost:3000/admin.html" style="background: #006699; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
                        View in Admin Dashboard
                    </a>
                </p>
            </div>
        `
    }),
    
    shipmentUpdate: (trackingId, status, customer) => ({
        to: customer,
        from: `LIVEXPRESS <${process.env.GMAIL_USER}>`,
        subject: `📦 Shipment Update: ${trackingId}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #006699; padding: 20px; color: white; text-align: center;">
                    <h1>Shipment Status Update</h1>
                </div>
                <div style="padding: 30px;">
                    <h3>Tracking ID: ${trackingId}</h3>
                    <div style="background: #e8f4f8; padding: 15px; border-radius: 4px; margin: 20px 0;">
                        <p style="font-size: 24px; color: #006699; margin: 0;">📍 ${status}</p>
                    </div>
                    <p>Your shipment status has been updated. Track your shipment in real-time:</p>
                    <a href="http://localhost:3000/#tracking" style="background: #006699; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">
                        Track Now
                    </a>
                </div>
            </div>
        `
    })
};

// Contact form email
app.post('/api/contact', (req, res) => {
    const { name, email, company, service, message } = req.body;

    // Validation
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Send confirmation email to customer
    transporter.sendMail(emailTemplates.contactConfirmation(name, email, message), (err, info) => {
        if (err) {
            console.error('Error sending confirmation email:', err);
            return res.status(500).json({ error: 'Failed to send email' });
        }
        console.log('Confirmation email sent:', info.response);
    });

    // Send notification email to admin
    transporter.sendMail(emailTemplates.adminNotification(name, email, company, message), (err, info) => {
        if (err) {
            console.error('Error sending admin notification:', err);
        } else {
            console.log('Admin notification sent:', info.response);
        }
    });

    // Save contact submission
    const contacts = JSON.parse(fs.readFileSync(contactSubmissionsFile, 'utf8'));
    contacts.push({
        id: `CONTACT-${Date.now()}`,
        name,
        email,
        company,
        service,
        message,
        status: 'open',
        timestamp: new Date().toISOString()
    });
    fs.writeFileSync(contactSubmissionsFile, JSON.stringify(contacts, null, 2));

    res.json({ 
        success: true, 
        message: 'Contact form submitted. Confirmation email sent!' 
    });
});

// Send shipment update email
app.post('/api/shipment/:id/notify', (req, res) => {
    const { trackingId, status, customerEmail } = req.body;

    if (!trackingId || !status || !customerEmail) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    transporter.sendMail(emailTemplates.shipmentUpdate(trackingId, status, customerEmail), (err, info) => {
        if (err) {
            console.error('Error sending shipment email:', err);
            return res.status(500).json({ error: 'Failed to send email' });
        }

        logAudit('SEND_SHIPMENT_NOTIFICATION', { trackingId, status }, req.headers['x-admin-id']);
        res.json({ success: true, message: 'Notification email sent!' });
    });
});

// Test email endpoint
app.get('/api/admin/test-email', verifyAdminToken, (req, res) => {
    const testEmail = {
        to: process.env.ADMIN_EMAIL,
        from: `LIVEXPRESS <${process.env.GMAIL_USER}>`,
        subject: '✅ Test Email - LIVEXPRESS Configuration',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0;">
                <h2 style="color: #006699;">✅ Email Configuration Successful!</h2>
                <p>If you're reading this, your email integration is working correctly.</p>
                <p><strong>Email Provider:</strong> Gmail SMTP</p>
                <p><strong>From:</strong> ${process.env.GMAIL_USER}</p>
                <p><strong>To:</strong> ${process.env.ADMIN_EMAIL}</p>
            </div>
        `
    };

    transporter.sendMail(testEmail, (err, info) => {
        if (err) {
            console.error('Test email failed:', err);
            return res.status(500).json({ error: 'Email test failed: ' + err.message });
        }

        res.json({ success: true, message: 'Test email sent successfully!' });
    });
});
```

---

## **Email with Attachments**

```javascript
// Send shipment invoice with attachment
app.post('/api/shipment/:id/send-invoice', verifyAdminToken, (req, res) => {
    const { trackingId, customerEmail, invoicePath } = req.body;

    const mailOptions = {
        to: customerEmail,
        from: `LIVEXPRESS <${process.env.GMAIL_USER}>`,
        subject: `📄 Invoice for Shipment ${trackingId}`,
        html: `<p>Attached is your shipment invoice.</p>`,
        attachments: [
            {
                filename: 'invoice.pdf',
                path: invoicePath
            }
        ]
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to send invoice' });
        }
        res.json({ success: true, message: 'Invoice sent via email!' });
    });
});
```

---

## **Scheduled Emails**

Send automatic status updates daily:

```bash
npm install node-cron
```

```javascript
const cron = require('node-cron');

// Send daily shipment updates (9 AM)
cron.schedule('0 9 * * *', () => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    
    shipments.forEach(shipment => {
        transporter.sendMail(emailTemplates.shipmentUpdate(
            shipment.id,
            shipment.status,
            shipment.customerEmail
        ), (err) => {
            if (err) console.error('Daily update email failed:', err);
        });
    });
    
    console.log('✅ Daily shipment emails sent');
});
```

---

## **Alternative Email Providers**

### SendGrid
```bash
npm install @sendgrid/mail
```

```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
    to: 'customer@example.com',
    from: 'noreply@example.com',
    subject: 'Order Confirmation',
    html: '<h1>Thanks for your order!</h1>'
};

sgMail.send(msg);
```

### Mailgun
```bash
npm install mailgun.js
```

```javascript
const mailgun = require('mailgun.js');
const mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY
});

mg.messages.create(process.env.MAILGUN_DOMAIN, {
    from: 'noreply@example.com',
    to: 'customer@example.com',
    subject: 'Order Confirmation',
    html: '<h1>Thanks for your order!</h1>'
});
```

---

## **Frontend: Contact Form Integration**

Update `script.js`:

```javascript
async function submitContactForm(event) {
    event.preventDefault();

    const formData = {
        name: document.getElementById('contact-name').value,
        email: document.getElementById('contact-email').value,
        company: document.getElementById('contact-company').value,
        service: document.getElementById('contact-service').value,
        message: document.getElementById('contact-message').value
    };

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error('Form submission failed');

        showAlert('✅ Thank you! Check your email for confirmation.', 'success');
        document.getElementById('contactForm').reset();

        // Log to analytics
        logEvent('contact_form_submitted', {
            service: formData.service,
            company: formData.company
        });

    } catch (error) {
        showAlert(`❌ Error: ${error.message}`, 'error');
    }
}
```

---

## **Email Best Practices**

### 1. Compliance
- ✅ Include unsubscribe link
- ✅ Add privacy policy
- ✅ Business address required
- ✅ GDPR compliant

### 2. Performance
- ✅ Keep HTML under 100KB
- ✅ Inline CSS (not separate stylesheets)
- ✅ Use web-safe fonts
- ✅ Test before sending

### 3. Deliverability
- ✅ Use proper From address
- ✅ Add SPF/DKIM records
- ✅ Monitor bounce rates
- ✅ Avoid spam trigger words

### 4. Tracking
- ✅ Add unique tracking IDs
- ✅ Use email open tracking
- ✅ Click tracking links
- ✅ Log all emails

### SPF Record (Gmail)
```
v=spf1 include:aspmx.l.google.com ~all
```

### DKIM (Gmail Auto-enabled)
Your domain's DKIM record is automatically set up by Google.

---

## **Testing Your Email Setup**

1. **Test endpoint**: `GET /api/admin/test-email`
2. **Check Gmail inbox**
3. **Verify subject line and formatting**
4. **Click links to ensure they work**

---

## **Troubleshooting**

### Email not sending
- Check .env file for correct Gmail password
- Enable 2-Step Verification
- Generate new App Password
- Verify SMTP credentials

### Emails going to spam
- Add authentication headers (SPF/DKIM)
- Use professional domain
- Test with spam checker
- Add unsubscribe link

### Rate limiting
- Gmail: max 300 emails/day
- SendGrid: Based on plan
- Mailgun: Based on plan

---

## **Email Compliance Checklist**

- [ ] SPF record configured
- [ ] DKIM enabled
- [ ] Unsubscribe link included
- [ ] Privacy policy linked
- [ ] Business address in footer
- [ ] Company name visible
- [ ] No deceptive subject lines
- [ ] P3P header set
- [ ] Bounce list maintained
- [ ] Spam complaints monitored

---

**Ready to send emails? Update your .env file and test the contact form!** 📧
