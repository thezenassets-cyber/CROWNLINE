# 📊 DATABASE & SCALING GUIDE

## Current Setup
- **Storage**: JSON files in `/data` folder
- **Users**: Up to ~5,000 shipments (comfortable)
- **Scalability**: Linear with file size

---

## **When to Migrate to Database**

### Red Flags (Time to Upgrade):
- ❌ Managing 10,000+ shipments
- ❌ Multiple simultaneous admin users
- ❌ Need real-time updates
- ❌ Complex queries needed
- ❌ Data backup critical
- ❌ High traffic (100+ users/day)

### Current System Works Best For:
- ✅ Small to medium logistics (< 500 shipments/month)
- ✅ Single or 2-3 admin users
- ✅ Basic tracking
- ✅ Simple analytics
- ✅ Learning/demo purposes

---

## **Option 1: MongoDB (Recommended)**

### Why MongoDB?
- NoSQL flexibility
- Scales horizontally
- Best for logistics data
- Free tier available

### Step 1: Setup MongoDB
1. Go to https://mongodb.com/cloud/atlas
2. Create free account
3. Create cluster
4. Get connection string

### Step 2: Install Driver
```bash
npm install mongoose
npm install dotenv
```

### Step 3: Create Models
```javascript
const mongoose = require('mongoose');

// Shipment Model
const shipmentSchema = new mongoose.Schema({
    id: String,
    origin: String,
    destination: String,
    type: String,
    status: String,
    progress: Number,
    eta: Date,
    customer: String,
    weight: String,
    value: String,
    createdAt: { type: Date, default: Date.now }
});

const Shipment = mongoose.model('Shipment', shipmentSchema);

// Visitor Model
const visitorSchema = new mongoose.Schema({
    timestamp: Date,
    ip: String,
    userAgent: String,
    path: String,
    country: String
});

const Visitor = mongoose.model('Visitor', visitorSchema);

// User Model
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: String,
    password: String, // Hash in production!
    role: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Contact Submission Model
const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    company: String,
    service: String,
    message: String,
    status: String,
    createdAt: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', contactSchema);

// Payment Model
const paymentSchema = new mongoose.Schema({
    shipmentId: String,
    amount: Number,
    method: String,
    status: String,
    transactionId: String,
    createdAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model('Payment', paymentSchema);
```

### Step 4: Connect to Database
```javascript
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

mongoose.connection.on('connected', () => {
    console.log('✅ Connected to MongoDB');
});
```

### Step 5: Update API Endpoints
```javascript
// Get all shipments
app.get('/api/admin/shipments', verifyAdminToken, async (req, res) => {
    try {
        const shipments = await Shipment.find().sort({ createdAt: -1 });
        res.json(shipments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create shipment
app.post('/api/admin/shipments', verifyAdminToken, async (req, res) => {
    try {
        const shipment = new Shipment(req.body);
        await shipment.save();
        res.json(shipment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update shipment
app.put('/api/admin/shipments/:id', verifyAdminToken, async (req, res) => {
    try {
        const shipment = await Shipment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(shipment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete shipment
app.delete('/api/admin/shipments/:id', verifyAdminToken, async (req, res) => {
    try {
        await Shipment.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

---

## **Option 2: PostgreSQL**

### Why PostgreSQL?
- Relational data structure
- ACID compliance
- Great for complex queries
- Open source

### Setup
1. Download PostgreSQL: https://postgresql.org
2. Install locally or use cloud: https://heroku.com
3. Create database

### Install Driver
```bash
npm install pg
```

### Connection Example
```javascript
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Query shipments
app.get('/api/admin/shipments', verifyAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM shipments ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

---

## **Option 3: Firebase (Easiest)**

### Why Firebase?
- No database setup
- Real-time updates
- Automatic scaling
- Free tier available

### Setup
1. Go to https://firebase.google.com
2. Create project
3. Setup Firestore
4. Get credentials

### Install
```bash
npm install firebase-admin
```

### Usage
```javascript
const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert('path/to/serviceAccountKey.json'),
    databaseURL: 'https://your-project.firebaseio.com'
});

const db = admin.firestore();

// Get shipments
app.get('/api/admin/shipments', verifyAdminToken, async (req, res) => {
    try {
        const snapshot = await db.collection('shipments').orderBy('createdAt', 'desc').get();
        const shipments = snapshot.docs.map(doc => doc.data());
        res.json(shipments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add shipment
app.post('/api/admin/shipments', verifyAdminToken, async (req, res) => {
    try {
        const docRef = await db.collection('shipments').add(req.body);
        res.json({ id: docRef.id, ...req.body });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

---

## **Migration Plan**

### Step 1: Setup New Database
1. Create account with chosen provider
2. Setup database
3. Configure connection

### Step 2: Install Libraries
```bash
npm install mongoose  # or pg or firebase-admin
```

### Step 3: Create Models
- Define schema for all data types
- Test connections

### Step 4: Migrate Data
```javascript
// Script to migrate JSON to DB
const jsonData = JSON.parse(fs.readFileSync('data/shipments.json'));
for (const shipment of jsonData) {
    await Shipment.create(shipment);
}
console.log('✅ Migration complete');
```

### Step 5: Update API
- Change file-based queries to database queries
- Test all endpoints
- Update admin dashboard

### Step 6: Backup
- Export all data from new database
- Keep old JSON files as backup
- Test recovery process

---

## **Performance Comparison**

| Feature | JSON Files | MongoDB | PostgreSQL | Firebase |
|---------|-----------|---------|-----------|----------|
| **Speed** | Good | Excellent | Excellent | Good |
| **Scalability** | Limited | Unlimited | Unlimited | Unlimited |
| **Users** | 2-3 | 100+ | 100+ | 100+ |
| **Shipments** | 5,000 | 1,000,000+ | 1,000,000+ | 1,000,000+ |
| **Cost** | Free | Free-$50/mo | Free-$100/mo | Free-$100/mo |
| **Setup Time** | 0 min | 15 min | 30 min | 10 min |

---

## **Cost Breakdown**

### MongoDB Atlas (Recommended)
- Free tier: 512MB storage
- M2 tier: $9/month for 10GB
- M10 tier: $57/month for 100GB

### PostgreSQL (Heroku)
- Free tier: 10,000 rows
- Standard tier: $9/month
- Premium tier: $50/month

### Firebase
- Free tier: 1GB storage
- Pay-as-you-go: $0.06/100K reads

---

## **Scaling Roadmap**

### Month 1-3 (JSON Files)
- 0-100 shipments
- 1-2 admins
- ✅ Current setup works

### Month 3-6 (Upgrade to MongoDB)
- 100-500 shipments
- 2-5 admins
- Real-time dashboard needed
- 🔄 Migrate to database

### Month 6+ (Scale Up)
- 500+ shipments
- 5+ admins
- Advanced reporting
- Multiple databases/regions
- Load balancing
- CDN for files

---

## .env Configuration

```bash
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/LIVEXPRESS

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost/LIVEXPRESS

# Firebase
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
FIREBASE_PROJECT_ID=your-project

# Node
NODE_ENV=production
PORT=3000
```

---

## Migration Timeline

| Step | Time | Difficulty |
|------|------|-----------|
| Database setup | 10 min | Easy |
| Schema creation | 30 min | Medium |
| Data migration | 5 min | Easy |
| API updates | 2 hours | Medium |
| Testing | 1 hour | Medium |
| Deployment | 30 min | Hard |
| **Total** | **4 hours** | **Medium** |

---

**Ready to scale? Start with MongoDB - it's the easiest upgrade path!** 🚀
