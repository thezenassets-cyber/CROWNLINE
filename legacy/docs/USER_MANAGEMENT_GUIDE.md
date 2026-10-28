# 👥 USER MANAGEMENT SYSTEM GUIDE

## Overview
Create and manage multiple admin users with different roles and permissions.

---

## **Features**

✅ Create multiple admin accounts  
✅ Assign different roles (admin, manager, viewer)  
✅ Permission management  
✅ User activity tracking  
✅ Account lockout protection  
✅ Password reset functionality  

---

## **Database Structure (JSON)**

Create `data/users.json`:

```json
[
  {
    "id": "admin@example.com",
    "username": "John Manager",
    "password": "hashed_password_here",
    "role": "admin",
    "email": "admin@example.com",
    "created": "2026-02-23T10:00:00.000Z",
    "lastLogin": "2026-02-23T11:30:00.000Z",
    "status": "active",
    "permissions": [
      "view_all",
      "manage_shipments",
      "manage_users",
      "export_data",
      "view_analytics"
    ]
  },
  {
    "id": "manager@example.com",
    "username": "Sarah Operations",
    "password": "hashed_password_here",
    "role": "manager",
    "email": "manager@example.com",
    "created": "2026-02-23T10:00:00.000Z",
    "lastLogin": "2026-02-23T09:15:00.000Z",
    "status": "active",
    "permissions": [
      "view_all",
      "manage_shipments",
      "export_data"
    ]
  }
]
```

---

## **Backend Implementation**

### Step 1: Add to server.js

```javascript
const crypto = require('crypto');
const usersFile = 'data/users.json';

// Initialize users file
if (!fs.existsSync(usersFile)) {
    const defaultUsers = [{
        id: 'admin@example.com',
        username: 'Admin',
        password: hashPassword('changeme123'),
        role: 'admin',
        email: 'admin@example.com',
        created: new Date().toISOString(),
        lastLogin: null,
        status: 'active',
        permissions: ['view_all', 'manage_shipments', 'manage_users', 'export_data']
    }];
    fs.writeFileSync(usersFile, JSON.stringify(defaultUsers, null, 2));
}

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Verify password
function verifyPassword(plainPassword, hashedPassword) {
    return hashPassword(plainPassword) === hashedPassword;
}

// Get all users
app.get('/api/admin/users', verifyAdminToken, (req, res) => {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    
    // Don't send passwords to frontend
    const safeUsers = users.map(u => {
        const { password, ...user } = u;
        return user;
    });
    
    res.json(safeUsers);
    logAudit('LIST_USERS', { count: users.length }, req.headers['x-admin-id']);
});

// Create new user
app.post('/api/admin/users', verifyAdminToken, (req, res) => {
    const { username, email, password, role } = req.body;
    
    // Validate input
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    
    // Check if user exists
    if (users.some(u => u.email === email)) {
        return res.status(400).json({ error: 'User already exists' });
    }
    
    const newUser = {
        id: email,
        username,
        password: hashPassword(password),
        role: role || 'manager',
        email,
        created: new Date().toISOString(),
        lastLogin: null,
        status: 'active',
        permissions: getPermissionsByRole(role || 'manager')
    };
    
    users.push(newUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    logAudit('CREATE_USER', { email, role: newUser.role }, req.headers['x-admin-id']);
    
    res.json({ 
        success: true, 
        message: `User ${username} created successfully`,
        user: { ...newUser, password: undefined }
    });
});

// Delete user
app.delete('/api/admin/users/:email', verifyAdminToken, (req, res) => {
    const { email } = req.params;
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    
    // Prevent deleting the last admin
    const adminCount = users.filter(u => u.role === 'admin').length;
    const userToDelete = users.find(u => u.email === email);
    
    if (userToDelete && userToDelete.role === 'admin' && adminCount === 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user' });
    }
    
    const updatedUsers = users.filter(u => u.email !== email);
    fs.writeFileSync(usersFile, JSON.stringify(updatedUsers, null, 2));
    
    logAudit('DELETE_USER', { email }, req.headers['x-admin-id']);
    res.json({ success: true, message: 'User deleted successfully' });
});

// Update user role
app.put('/api/admin/users/:email/role', verifyAdminToken, (req, res) => {
    const { email } = req.params;
    const { role } = req.body;
    
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.role = role;
    user.permissions = getPermissionsByRole(role);
    
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    logAudit('UPDATE_USER_ROLE', { email, role }, req.headers['x-admin-id']);
    
    res.json({ success: true, message: 'User role updated' });
});

// Reset password
app.post('/api/admin/users/:email/reset-password', verifyAdminToken, (req, res) => {
    const { email } = req.params;
    const { newPassword } = req.body;
    
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.password = hashPassword(newPassword);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    logAudit('RESET_USER_PASSWORD', { email }, req.headers['x-admin-id']);
    
    res.json({ success: true, message: 'Password reset successfully' });
});

// Deactivate/Reactivate user
app.put('/api/admin/users/:email/status', verifyAdminToken, (req, res) => {
    const { email } = req.params;
    const { status } = req.body; // 'active' or 'inactive'
    
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = status;
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    logAudit('UPDATE_USER_STATUS', { email, status }, req.headers['x-admin-id']);
    
    res.json({ success: true, message: `User status updated to ${status}` });
});

// Get permission levels
function getPermissionsByRole(role) {
    const permissions = {
        admin: [
            'view_all',
            'manage_shipments',
            'manage_users',
            'export_data',
            'view_analytics',
            'view_audit_logs',
            'manage_settings'
        ],
        manager: [
            'view_all',
            'manage_shipments',
            'export_data',
            'view_analytics'
        ],
        viewer: [
            'view_all',
            'view_analytics'
        ]
    };
    
    return permissions[role] || permissions.viewer;
}

// Verify user permissions
function hasPermission(user, permission) {
    return user.permissions && user.permissions.includes(permission);
}

// Enhanced login with user tracking
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    
    const user = users.find(u => u.email === email);
    
    if (!user || !verifyPassword(password, user.password)) {
        logAudit('FAILED_LOGIN', { email }, email);
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.status === 'inactive') {
        logAudit('INACTIVE_LOGIN_ATTEMPT', { email }, email);
        return res.status(403).json({ error: 'User account is inactive' });
    }
    
    // Update last login
    user.lastLogin = new Date().toISOString();
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    logAudit('LOGIN', { email }, email);
    
    res.json({
        success: true,
        token: generateAdminToken(email),
        user: {
            email: user.email,
            username: user.username,
            role: user.role,
            permissions: user.permissions
        }
    });
});
```

---

## **Frontend: User Management UI**

Add to `admin.html`:

```html
<!-- User Management Section -->
<section id="userManagement" class="admin-section" style="display:none;">
    <h2>👥 User Management</h2>
    
    <div class="user-actions">
        <h3>Create New User</h3>
        <form id="newUserForm" onsubmit="createUser(event)">
            <input type="text" placeholder="Username" id="newUsername" required>
            <input type="email" placeholder="Email" id="newEmail" required>
            <input type="password" placeholder="Password" id="newPassword" required>
            <select id="newRole">
                <option value="manager">Manager</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
            </select>
            <button type="submit" class="btn-admin btn-success">Create User</button>
        </form>
    </div>
    
    <div class="user-list">
        <h3>Current Users</h3>
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Last Login</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="usersTableBody">
                <!-- Populated by JavaScript -->
            </tbody>
        </table>
    </div>
</section>

<script>
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'x-admin-token': 'ChangeMeLocalOnly' }
        });
        
        if (!response.ok) throw new Error('Failed to load users');
        
        const users = await response.json();
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        
        users.forEach(user => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>
                    <select class="role-select" onchange="updateUserRole('${user.email}', this.value)">
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                        <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    </select>
                </td>
                <td>${new Date(user.lastLogin || user.created).toLocaleString()}</td>
                <td>
                    <select class="status-select" onchange="updateUserStatus('${user.email}', this.value)">
                        <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </td>
                <td>
                    <button onclick="resetUserPassword('${user.email}')" class="btn-small btn-warning">Reset Password</button>
                    <button onclick="deleteUser('${user.email}')" class="btn-small btn-danger">Delete</button>
                </td>
            `;
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function createUser(event) {
    event.preventDefault();
    
    const userData = {
        username: document.getElementById('newUsername').value,
        email: document.getElementById('newEmail').value,
        password: document.getElementById('newPassword').value,
        role: document.getElementById('newRole').value
    };
    
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': 'ChangeMeLocalOnly'
            },
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        
        showAlert('✅ User created successfully!', 'success');
        document.getElementById('newUserForm').reset();
        loadUsers();
    } catch (error) {
        showAlert(`❌ Error creating user: ${error.message}`, 'error');
    }
}

async function deleteUser(email) {
    if (!confirm(`Are you sure you want to delete ${email}?`)) return;
    
    try {
        const response = await fetch(`/api/admin/users/${email}`, {
            method: 'DELETE',
            headers: { 'x-admin-token': 'ChangeMeLocalOnly' }
        });
        
        if (!response.ok) throw new Error('Failed to delete user');
        
        showAlert('✅ User deleted successfully!', 'success');
        loadUsers();
    } catch (error) {
        showAlert(`❌ Error deleting user: ${error.message}`, 'error');
    }
}

async function updateUserRole(email, role) {
    try {
        const response = await fetch(`/api/admin/users/${email}/role`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': 'ChangeMeLocalOnly'
            },
            body: JSON.stringify({ role })
        });
        
        if (!response.ok) throw new Error('Failed to update role');
        showAlert('✅ User role updated!', 'success');
    } catch (error) {
        showAlert(`❌ Error: ${error.message}`, 'error');
    }
}

async function updateUserStatus(email, status) {
    try {
        const response = await fetch(`/api/admin/users/${email}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': 'ChangeMeLocalOnly'
            },
            body: JSON.stringify({ status })
        });
        
        if (!response.ok) throw new Error('Failed to update status');
        showAlert('✅ User status updated!', 'success');
    } catch (error) {
        showAlert(`❌ Error: ${error.message}`, 'error');
    }
}

async function resetUserPassword(email) {
    const newPassword = prompt('Enter new password for ' + email + ':');
    if (!newPassword) return;
    
    try {
        const response = await fetch(`/api/admin/users/${email}/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': 'ChangeMeLocalOnly'
            },
            body: JSON.stringify({ newPassword })
        });
        
        if (!response.ok) throw new Error('Failed to reset password');
        showAlert('✅ Password reset successfully!', 'success');
    } catch (error) {
        showAlert(`❌ Error: ${error.message}`, 'error');
    }
}

// Load users on page load
loadUsers();
</script>

<style>
.user-actions {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 30px;
}

.user-actions form {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr auto;
    gap: 10px;
    align-items: end;
}

.user-actions input,
.user-actions select {
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.role-select,
.status-select {
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
}

.admin-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
}

.admin-table th {
    background: #006699;
    color: white;
    padding: 12px;
    text-align: left;
}

.admin-table td {
    padding: 12px;
    border-bottom: 1px solid #ddd;
}

.admin-table tr:hover {
    background: #f8f9fa;
}

.btn-small {
    padding: 6px 12px;
    font-size: 12px;
    margin-right: 5px;
}
</style>
```

---

## **Roles & Permissions Matrix**

| Permission | Admin | Manager | Viewer |
|-----------|-------|---------|--------|
| View all data | ✅ | ✅ | ✅ |
| Manage shipments | ✅ | ✅ | ❌ |
| Create users | ✅ | ❌ | ❌ |
| Delete users | ✅ | ❌ | ❌ |
| Export data | ✅ | ✅ | ❌ |
| View analytics | ✅ | ✅ | ✅ |
| View audit logs | ✅ | ❌ | ❌ |
| Manage settings | ✅ | ❌ | ❌ |

---

## **Security Best Practices**

### 1. Strong Passwords
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Never reuse passwords

### 2. Session Management
- Sessions expire after 24 hours of inactivity
- Force logout on password change
- Invalid old sessions

### 3. Audit Logging
- Log all user actions
- Track login attempts
- Record permission changes

### 4. Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many login attempts, try again later'
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
    // Login logic
});
```

### 5. Password Hashing
Never store plain text passwords! Use bcrypt instead:
```javascript
const bcrypt = require('bcryptjs');

function hashPassword(password) {
    return bcrypt.hashSync(password, 10);
}

function verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compareSync(plainPassword, hashedPassword);
}
```

---

## **Default Setup**

Initial admin user:
- **Email**: admin@example.com
- **Password**: changeme123
- **Role**: Admin

⚠️ **Change this password immediately after first login!**

---

## **Troubleshooting**

### "User not found" error
- Check email address spelling
- Verify user exists in data/users.json

### "Invalid credentials"
- Try resetting password
- Check for typos in email/password

### Cannot delete user
- Ensure at least one admin exists
- Cannot have zero admin users

---

**Ready to create multiple admin accounts? Start with the dashboard!** 🔐
