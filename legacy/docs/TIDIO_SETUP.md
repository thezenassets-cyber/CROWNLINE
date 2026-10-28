# 🚀 Tidio Live Chat Setup Guide

## Overview
Your LIVEXPRESS website now supports **Tidio Live Chat** - a professional real-time communication platform backed by AI and live support agents.

---

## ✅ Quick Setup (3 Minutes)

### Step 1: Create Tidio Account
1. Visit **https://www.tidio.com/**
2. Click **"Start Free"** or **"Sign Up"**
3. Enter your email and create an account
4. Verify your email address

### Step 2: Get Your Tidio ID
1. Log in to your Tidio Dashboard
2. Go to **Settings** → **Channels** → **Website**
3. Select your website or create a new one
4. Copy your **Project ID** (looks like: `12345abcdef`)

### Step 3: Add Tidio ID to Your Website
1. Open `index.html` in your code editor
2. Find this line (around line 676):
   ```html
   <script src="https://code.tidio.co/YOUR_TIDIO_ID.js" async></script>
   ```
3. Replace `YOUR_TIDIO_ID` with your actual Tidio Project ID
4. Save the file
5. Reload your website - the Tidio chat widget will appear! 💬

---

## 🎨 Customization Options

### Customize Chat Widget Appearance
In your Tidio Dashboard:
1. Go to **Settings** → **Appearance**
2. Change:
   - Chat bubble color (customize to brand colors)
   - Widget position (bottom-right, bottom-left, top-right)
   - Welcome message
   - Chat icon

### Set Up Automated Responses
1. Go to **Automation** in Tidio
2. Create rules for:
   - **Greeting messages** when visitor arrives
   - **Auto-replies** to common questions
   - **Business hours** notifications
   - **Shipping inquiries** routing

### Example Automation Setup:
```
Trigger: Visitor opens chat
Action: Display welcome message
Message: "Welcome to LIVEXPRESS! 👋 
How can we help you with your shipment today?

Quick options:
📦 Track Shipment
📋 Get Quote
❓ General Questions"
```

---

## 👥 Team Management

### Add Support Agents
1. Go to **Team** in Tidio Dashboard
2. Click **"Add Agent"**
3. Invite your team members by email
4. Assign roles:
   - **Admin**: Full access
   - **Agent**: Can chat with customers
   - **Viewer**: Report-only access

### Set Status
Agents can set their status:
- **Available (Online)** 🟢
- **Busy** 🟡
- **Offline** ⚫

Visitors see agent status in real-time!

---

## 📊 Monitoring & Analytics

### Track Performance
Tidio Dashboard shows:
- **Conversations**: Total chats, open, resolved
- **Response Time**: Average response speed
- **Customer Satisfaction**: Rating & reviews
- **Chat History**: Search past conversations
- **Reports**: Detailed analytics

### View Reports
1. Go to **Reports** in Tidio
2. Filter by:
   - Date range
   - Agent
   - Status
   - Rating

---

## 💡 Advanced Features

### AI-Powered Chatbot
Enable Tidio Bot to handle:
- FAQ responses
- Lead qualification
- Appointment scheduling
- Support ticket creation

1. Go to **Automation** → **Bot**
2. Enable AI Bot
3. Train with your FAQ content
4. Bot will handle simple queries 24/7

### Integration with Other Tools
Tidio connects to:
- **Email**: Forward conversations to email
- **Slack**: Get alerts in Slack
- **CRM**: Sync customer data
- **Webhooks**: Custom integrations

---

## 🔧 Troubleshooting

### Chat Widget Not Appearing?
1. **Check Tidio ID**: Verify it's correctly placed in `index.html`
2. **Clear Cache**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. **Check Console**: Open Developer Tools (F12) → Console for errors
4. **Browser Extensions**: Disable ad blockers that might block chat

### Agents Not Receiving Messages?
1. Ensure Tidio Project is **Active** in dashboard
2. Check agent **Status** is set to **Available**
3. Verify email notifications are enabled
4. Check for routing rules in **Automation**

### Widget Position Issues?
Your site uses custom CSS for the fallback chat. Tidio widget behavior:
- Tidio manages its own positioning
- The fallback chat only shows if Tidio fails to load
- You can position it in Tidio settings

---

## 🔐 Security & Privacy

### GDPR Compliance
- Tidio is GDPR compliant
- Customer data is encrypted
- Privacy policy included

### Data Storage
- Chat history: Stored securely on Tidio servers
- Customer info: Follows GDPR guidelines
- Automatic data retention policies available

---

## 📞 Support Options

### In-App Support
- Click the **?** icon in your Tidio dashboard
- Search knowledge base
- Contact Tidio support team

### Email Support
- **support@tidio.com**
- Response time: Typically within 24 hours

### Live Chat (Meta!)
- Tidio has live chat support on their website
- https://www.tidio.com/ → bottom right corner

---

## 🎯 Common Use Cases for LIVEXPRESS

### Shipment Tracking
- **Customer asks**: "Can you track shipment LX-2026-001234?"
- **Agent responds**: Pull up system, provide real-time status
- **Tidio helps**: Quick access to customer history

### Booking New Shipments
- **Customer**: "I need to ship boxes from LA to NYC"
- **Agent**: Discusses requirements, quotes pricing
- **Tidio helps**: Share documents, images of packaging

### Complaints/Issues
- **Customer**: "My package is delayed"
- **Agent**: Investigates issue, offers compensation
- **Tidio helps**: Create support ticket, automatic follow-up

### Rate Quote
- **Customer**: "What's the cost for 50 pallets?"
- **Agent**: Calculate based on route/weight
- **Tidio helps**: Send quote via chat, auto-generate PDF

---

## 📱 Mobile Support

### Customer Side
- Customers use chat on any device
- Responsive design
- Mobile app available

### Agent Side
- Agents can use web dashboard
- Tidio mobile app for iOS/Android
- Get notifications on phone
- Respond from anywhere

---

## 🚀 Going Live

### Pre-Launch Checklist
- ✅ Tidio ID added to `index.html`
- ✅ Tested chat on desktop & mobile
- ✅ Added team members/agents
- ✅ Set up welcome message
- ✅ Configured auto-responses
- ✅ Enable business hours
- ✅ Test conversation flow

### Notify Customers
Add to your website/emails:
```
📞 NEW: Live Chat Now Available!
Get instant support from our team.
Chat with us 24/7! 💬
```

---

## 💰 Pricing

### Free Plan
- Up to 2 agents
- Unlimited conversations
- Basic reports
- Email integration
- **Perfect for starting!**

### Paid Plans
- From $25/month
- Advanced automation
- Bot features
- Priority support
- Unlimited agents
- Custom branding

Visit https://www.tidio.com/pricing/ for details

---

## 📈 Next Steps

1. **Complete Setup** ✓ (you're here!)
2. **Test Chat** - Send yourself a message
3. **Train Team** - Show agents how to use Tidio
4. **Monitor** - Check analytics daily
5. **Optimize** - Adjust based on chat patterns
6. **Scale** - Add features as you grow

---

## 🎓 Learning Resources

- **Tidio Blog**: https://www.tidio.com/blog/
- **Video Tutorials**: https://academy.tidio.com/
- **Documentation**: https://tidio.com/help/
- **Community**: https://community.tidio.com/

---

## ✉️ Questions?

Stuck? Here's what to do:
1. Check this guide again (Ctrl+F search)
2. Visit Tidio help: https://tidio.com/help/
3. Contact Tidio support: support@tidio.com
4. Check browser console (F12) for errors
5. Clear browser cache and reload

---

**Your website now has professional, real-time chat support! 🎉**

Keep in touch with your customers, resolve issues faster, and grow your business with Tidio Live Chat.

**Happy chatting!** 💬
