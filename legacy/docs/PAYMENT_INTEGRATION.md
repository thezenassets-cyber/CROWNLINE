# 💳 PAYMENT INTEGRATION GUIDE

## Overview
Add payment processing to LIVEXPRESS for shipment quotes and invoicing.

---

## **Option 1: Stripe (Recommended)**

### Step 1: Create Stripe Account
1. Go to https://stripe.com
2. Sign up (free)
3. Get API Keys:
   - Publishable Key: `pk_test_...`
   - Secret Key: `sk_test_...`

### Step 2: Install Stripe SDK
```bash
npm install stripe dotenv
```

### Step 3: Add to server.js
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create payment intent
app.post('/api/payments/create-intent', verifyAdminToken, async (req, res) => {
    const { shipmentId, amount, currency = 'usd' } = req.body;

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Stripe uses cents
            currency,
            metadata: { shipmentId }
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Confirm payment
app.post('/api/payments/confirm', verifyAdminToken, async (req, res) => {
    const { paymentIntentId } = req.body;

    try {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (intent.status === 'succeeded') {
            // Record in database
            const payments = JSON.parse(fs.readFileSync(paymentsFile, 'utf8'));
            payments.push({
                id: intent.id,
                shipmentId: intent.metadata.shipmentId,
                amount: intent.amount / 100,
                status: 'completed',
                method: 'stripe',
                timestamp: new Date().toISOString()
            });
            fs.writeFileSync(paymentsFile, JSON.stringify(payments, null, 2));

            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Payment not completed' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### Step 4: Setup .env File
```
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

### Step 5: Add Payment Form to Admin Panel
```html
<form id="paymentForm">
    <input type="number" id="amount" placeholder="Amount" required>
    <select id="shipmentId" required>
        <!-- Populated from shipments -->
    </select>
    <button type="submit">Process Payment</button>
</form>

<script src="https://js.stripe.com/v3/"></script>
<script>
    const stripe = Stripe('pk_test_YOUR_KEY');
    
    document.getElementById('paymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = document.getElementById('amount').value;
        const shipmentId = document.getElementById('shipmentId').value;

        // Create payment intent
        const response = await fetch('/api/payments/create-intent', {
            method: 'POST',
            headers: { 'x-admin-token': 'ChangeMeLocalOnly', 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId, amount })
        });

        const { clientSecret } = await response.json();

        // Confirm payment
        const result = await stripe.confirmCardPayment(clientSecret);
        if (result.paymentIntent.status === 'succeeded') {
            alert('Payment successful!');
        }
    });
</script>
```

---

## **Option 2: PayPal**

### Step 1: Create PayPal Account
1. Go to https://developer.paypal.com
2. Sign up for business account
3. Get Client ID and Secret

### Step 2: Install PayPal SDK
```bash
npm install @paypal/checkout-server-sdk
```

### Step 3: Add to server.js
```javascript
const paypal = require('@paypal/checkout-server-sdk');

// Approve order
app.post('/api/payments/paypal/create', verifyAdminToken, async (req, res) => {
    const { shipmentId, amount } = req.body;

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
            amount: {
                currency_code: "USD",
                value: amount
            },
            custom_id: shipmentId
        }]
    });

    try {
        const order = await client.execute(request);
        res.json({ id: order.result.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Capture payment
app.post('/api/payments/paypal/capture', verifyAdminToken, async (req, res) => {
    const { orderId } = req.body;

    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    try {
        const capture = await client.execute(request);
        if (capture.result.status === 'COMPLETED') {
            // Record payment
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

---

## **Option 3: Direct Bank Transfer**

### Setup in Admin:
1. Store bank details securely
2. Generate invoices with bank info
3. Track manual payments
4. Send invoice emails

```javascript
// Generate invoice
app.post('/api/payments/invoice', verifyAdminToken, async (req, res) => {
    const { shipmentId, customerEmail, amount } = req.body;

    const invoiceHTML = `
        <h2>Invoice for Shipment ${shipmentId}</h2>
        <p>Amount: $${amount}</p>
        <h3>Bank Transfer Details:</h3>
        <p>Account Name: LIVEXPRESS</p>
        <p>Account Number: 1234567890</p>
        <p>Routing Number: 123456789</p>
        <p>Bank: Global Bank International</p>
    `;

    await sendEmail(customerEmail, 'Invoice for Shipment', invoiceHTML);
    res.json({ success: true, invoiceId: `INV-${Date.now()}` });
});
```

---

## **Integration Checklist**

- [ ] Choose payment processor
- [ ] Create account and get API keys
- [ ] Install SDK
- [ ] Add endpoints to server
- [ ] Create payment form in admin
- [ ] Test with test credentials
- [ ] Setup error handling
- [ ] Configure webhook for payment confirmations
- [ ] Add to invoice generation
- [ ] Setup payment confirmation emails
- [ ] Monitor transactions in dashboard

---

## **Security Best Practices**

1. **Never expose secret keys** - Use environment variables
2. **Validate all payments** - Verify on server side
3. **Use HTTPS** - Always for payment pages
4. **Implement webhooks** - For real-time updates
5. **Store receipts** - For audit trail
6. **Encrypt sensitive data** - Payment info
7. **Implement rate limiting** - Prevent abuse
8. **Test thoroughly** - Use test accounts

---

## **Testing**

### Stripe Test Cards:
```
4242 4242 4242 4242 - Visa (successful)
4000 0000 0000 0002 - Visa (declined)
```

### PayPal Sandbox:
```
Username: sb-xxxxx@businesstest.com
Password: [sandbox password]
```

---

## Monthly Costs:
- **Stripe**: 2.9% + $0.30 per transaction
- **PayPal**: 2.2% + $0.30 per transaction
- **Direct Transfer**: Free (manual handling)
