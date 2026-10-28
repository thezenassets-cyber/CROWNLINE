# 📤 CSV EXPORT & REPORTING GUIDE

## Overview
Export shipments, visitors, and audit logs to CSV for external analysis and reporting.

---

## **CSV Export Features**

### What Can Be Exported:
1. **Shipments** - All shipment data
2. **Visitors** - Website visitor analytics
3. **Audit Logs** - Admin action history
4. **Contacts** - Contact form submissions
5. **Payments** - Payment transactions

---

## **Implementation**

### Step 1: Install Required Package
```bash
npm install json2csv dotenv
```

### Step 2: Add to server.js
```javascript
const { Parser } = require('json2csv');
const fs = require('fs');

// Export shipments as CSV
app.get('/api/admin/export/shipments', verifyAdminToken, (req, res) => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));

    try {
        const fields = ['id', 'origin', 'destination', 'type', 'status', 'progress', 'eta', 'customer', 'weight', 'value'];
        const parser = new Parser({ fields });
        const csv = parser.parse(shipments);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=shipments-export.csv');
        res.send(csv);

        logAudit('EXPORT_SHIPMENTS', { format: 'CSV', count: shipments.length }, req.headers['x-admin-id']);
    } catch (error) {
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// Export visitors as CSV
app.get('/api/admin/export/visitors', verifyAdminToken, (req, res) => {
    const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));

    try {
        const fields = ['timestamp', 'ip', 'userAgent', 'path', 'country'];
        const parser = new Parser({ fields });
        const csv = parser.parse(visitors);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=visitors-export.csv');
        res.send(csv);

        logAudit('EXPORT_VISITORS', { format: 'CSV', count: visitors.length }, req.headers['x-admin-id']);
    } catch (error) {
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// Export audit logs as CSV
app.get('/api/admin/export/audit-logs', verifyAdminToken, (req, res) => {
    const logs = JSON.parse(fs.readFileSync(auditLogFile, 'utf8'));

    try {
        const fields = ['timestamp', 'action', 'adminId', 'details'];
        const parser = new Parser({ fields });
        const csv = parser.parse(logs);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs-export.csv');
        res.send(csv);

        logAudit('EXPORT_AUDIT_LOGS', { format: 'CSV', count: logs.length }, req.headers['x-admin-id']);
    } catch (error) {
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// Export contacts as CSV
app.get('/api/admin/export/contacts', verifyAdminToken, (req, res) => {
    const contacts = JSON.parse(fs.readFileSync(contactSubmissionsFile, 'utf8'));

    try {
        const fields = ['id', 'name', 'email', 'company', 'service', 'status', 'timestamp'];
        const parser = new Parser({ fields });
        const csv = parser.parse(contacts);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.csv');
        res.send(csv);

        logAudit('EXPORT_CONTACTS', { format: 'CSV', count: contacts.length }, req.headers['x-admin-id']);
    } catch (error) {
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});
```

---

## **Frontend Import Buttons**

Add to `admin.html`:

```html
<!-- Export Buttons -->
<div class="export-section" style="margin-bottom: 20px;">
    <h3>📥 Export Data</h3>
    <button class="btn-admin btn-primary" onclick="exportData('shipments')">Export Shipments (CSV)</button>
    <button class="btn-admin btn-primary" onclick="exportData('visitors')">Export Visitors (CSV)</button>
    <button class="btn-admin btn-primary" onclick="exportData('audit-logs')">Export Audit Logs (CSV)</button>
    <button class="btn-admin btn-primary" onclick="exportData('contacts')">Export Contacts (CSV)</button>
</div>

<script>
async function exportData(type) {
    try {
        const response = await fetch(`/api/admin/export/${type}`, {
            headers: { 'x-admin-token': 'ChangeMeLocalOnly' }
        });

        if (!response.ok) throw new Error('Export failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        showAlert(`✅ ${type} exported successfully!`, 'success');
    } catch (error) {
        showAlert(`❌ Export failed: ${error.message}`, 'error');
    }
}
</script>
```

---

## **CSV Formats**

### Shipments CSV
```
id,origin,destination,type,status,progress,eta,customer,weight,value
LX-2026-001234,Shanghai,Rotterdam,Ocean Freight,In Transit,65,2026-03-10,TechCorp Inc,50 tons,$150000
```

### Visitors CSV
```
timestamp,ip,userAgent,path,country
2026-02-23T10:30:00.000Z,192.168.1.1,Mozilla/5.0,/,US
```

### Audit Logs CSV
```
timestamp,action,adminId,details
2026-02-23T10:30:00.000Z,UPDATE_SHIPMENT_STATUS,admin@example.com,"{""shipmentId"":""LX-2026-001234"",""newStatus"":""Delivered""}"
```

---

## **Advanced Exports**

### Excel Format (.xlsx)
```bash
npm install xlsx
```

```javascript
const XLSX = require('xlsx');

app.get('/api/admin/export/shipments-excel', verifyAdminToken, (req, res) => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));

    const worksheet = XLSX.utils.json_to_sheet(shipments);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Shipments');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=shipments.xlsx');

    XLSX.write(workbook, { stream: res, bookType: 'xlsx' });
});
```

### PDF Reports
```bash
npm install pdf-lib
```

```javascript
const { PDFDocument, rgb } = require('pdf-lib');

app.get('/api/admin/export/report-pdf', verifyAdminToken, async (req, res) => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size

    // Add title
    page.drawText('LIVEXPRESS Report', {
        x: 50,
        y: 750,
        size: 24,
        color: rgb(0, 102, 204)
    });

    // Add stats
    let y = 700;
    page.drawText(`Total Shipments: ${shipments.length}`, { x: 50, y });
    y -= 30;
    page.drawText(`Total Visitors: ${visitors.length}`, { x: 50, y });
    y -= 30;
    page.drawText(`Report Generated: ${new Date().toLocaleString()}`, { x: 50, y });

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    res.send(Buffer.from(pdfBytes));
});
```

---

## **Scheduled Exports**

Auto-export data daily:

```javascript
const cron = require('node-cron');

// Export shipments every day at 2 AM
cron.schedule('0 2 * * *', () => {
    const shipments = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    const fields = ['id', 'origin', 'destination', 'status', 'progress', 'eta'];
    const parser = new Parser({ fields });
    const csv = parser.parse(shipments);

    const date = new Date().toISOString().split('T')[0];
    fs.writeFileSync(`data/exports/shipments-${date}.csv`, csv);
    console.log(`✅ Daily export created: shipments-${date}.csv`);
});
```

---

## **Analysis in Excel**

After exporting to CSV:

1. **Open in Excel**
2. **Create Pivot Table**
3. **Analyze**:
   - Shipments by status
   - Revenue by route
   - Visitor by country
   - Admin activity by user

### Useful Formulas:
```excel
=COUNTIF(Status,"Delivered")  // Count delivered
=SUMIF(Status,"In Transit",Amount)  // Total in transit
=AVERAGE(Progress)  // Average progress
=COUNTIF(Country,"US")  // Visitors from US
```

---

## **Data Privacy**

### Compliance Considerations:
- ✅ Log all exports (audit trail)
- ✅ Restrict export access (admin only)
- ✅ Encrypt exported files
- ✅ Delete exports after 30 days
- ✅ GDPR compliance (IP anonymization)

### Anonymize Data:
```javascript
function anonymizeVisitors(visitors) {
    return visitors.map(v => ({
        ...v,
        ip: '***.***.**.*', // Anonymize IP
        userAgent: 'Hidden'  // Hide user agent
    }));
}
```

---

## **File Size Management**

### Auto-Cleanup Old Exports:
```javascript
cron.schedule('0 0 * * *', () => {
    const exportsDir = 'data/exports';
    const files = fs.readdirSync(exportsDir);

    files.forEach(file => {
        const filePath = path.join(exportsDir, file);
        const stat = fs.statSync(filePath);
        const ageInDays = (Date.now() - stat.mtime) / (1000 * 60 * 60 * 24);

        if (ageInDays > 30) {
            fs.unlinkSync(filePath);
            console.log(`🗑️  Deleted old export: ${file}`);
        }
    });
});
```

---

## **Performance Tips**

1. **Large Exports**: Use streaming
2. **Compress Files**: Generate .zip for multiple files
3. **Cache Popular Reports**: Pre-generate common exports
4. **Rate Limiting**: Limit export frequency per user

---

**Ready to export? Add the CSV export buttons to your admin dashboard!** 📊
