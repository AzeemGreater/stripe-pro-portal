# 🛡️ Shield Pro Portal — WooCommerce Stripe Gateway Management Suite

Full-stack Node.js portal hosted at `stripe.azeemgreater.com` (Hostinger Business Web Hosting via GitHub CI/CD) acting as the central management control panel for your custom WooCommerce Stripe Gateway WordPress plugin.

---

## 🌟 Key Features

1. **Dual Role Access System (Admin & Clients)**
   - **Super Admin Panel** (`/admin/dashboard.html`):
     - Manage client accounts and set per-user connected website quotas (e.g. 5, 10, unlimited).
     - Issue and revoke `SHIELD-XXXX-XXXX-XXXX-XXXX` license keys.
     - Live global monitor of all connected WordPress websites with plugin and WooCommerce versions.
     - Comprehensive tamper-evident audit and activity logs.
   - **Client Portal** (`/user/dashboard.html`):
     - **Browser-Styled Tabs** in the top navigation bar for all client's connected stores.
     - Switch seamlessly between connected stores in one click.
     - Remote control of the store's Stripe plugin settings without logging into WordPress!

2. **The 3 In-Portal Website Management Tabs (Identical to Plugin UI)**:
   - **⚙️ Settings**: Remote control of WooCommerce Stripe Gateway options (Test Mode, Title, Description, Statement Descriptor, Capture Charge, Saved Cards, Inline Form, Debug Logging) pushed directly to WordPress via REST API.
   - **📊 Transactions Dashboard**: Real-time sales volume, net revenue, Stripe fees, available & pending balance, success rates, charge logs, bank payouts, and dispute tracker.
   - **🔧 Advance Tools (Metadata Customizer)**: White-label suite allowing custom store branding, URL shielding (`hidden`/`send`), and customizable order description templates with insertion tags (`{store_name}`, `{order_number}`, etc.) and live simulated charge preview card.
   - **🛒 WooCommerce Store Orders**: Live order feed fetched via WooCommerce REST API (`/wp-json/wc/v3/orders`) displaying real-time purchase totals, customer details, purchased items, and status indicators.

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Navigate to portal directory
cd stripe-portal

# 2. Install dependencies
npm install

# 3. Initialize SQLite Database & default admin
node database/schema.js

# 4. Start portal
npm start
```
The portal will be live at `http://localhost:3000`.

### Default Credentials
- **Admin Email**: `admin@azeemgreater.com`
- **Admin Password**: `ShieldAdmin@2026!` *(Change this in your .env file)*

---

## 🌐 Deploying to Hostinger via GitHub Actions

### Step 1: Hostinger Node.js Application Setup
1. Log into your **Hostinger hPanel**.
2. Go to **Websites > Manage > Node.js**.
3. Create a new Node.js application:
   - **Node.js version**: `20.x` or `22.x`
   - **Application root**: `public_html/stripe-portal` (or subdomain root for `stripe.azeemgreater.com`)
   - **Application startup file**: `server.js`
4. Click **Create**.

### Step 2: GitHub Repository Secrets
In your GitHub repository, go to **Settings > Secrets and variables > Actions** and add the following repository secrets:
- `HOSTINGER_FTP_HOST`: Your Hostinger FTP IP or hostname (e.g. `ftp.azeemgreater.com` or server IP)
- `HOSTINGER_FTP_USER`: Your Hostinger FTP username
- `HOSTINGER_FTP_PASSWORD`: Your Hostinger FTP password
- `HOSTINGER_SERVER_DIR`: Path on server (e.g. `/public_html/` or `/domains/stripe.azeemgreater.com/public_html/`)

Every time you `git push` to `main`, GitHub Actions will automatically deploy the files and restart the server!

---

## 🔌 WordPress Plugin Integration

When a user installs your custom WooCommerce Stripe plugin on their website:
1. In WordPress Admin, navigate to **WooCommerce > Settings > Payments > Stripe**.
2. Enter their **Account Email** and **License Key**.
3. The plugin communicates with `stripe.azeemgreater.com/api/license/activate` and automatically registers itself.
4. The site immediately appears as an active browser tab inside the client's Shield Pro Portal dashboard!
