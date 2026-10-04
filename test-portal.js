/**
 * Shield Pro Portal - Automated End-to-End Verification Test
 */

const { app } = require('./server');
const http = require('http');

let server;
const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('🧪 Starting Shield Pro Portal End-to-End Test Suite...\n');

  // Start temporary server
  await new Promise((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`🚀 Test server listening on ${BASE_URL}`);
      resolve();
    });
  });

  try {
    // 1. Health check
    console.log('1️⃣ Testing GET /api/health...');
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const health = await healthRes.json();
    if (health.status !== 'ok') throw new Error('Health check failed');
    console.log('   ✅ Health check passed:', health);

    // 2. Admin Login
    console.log('\n2️⃣ Testing Admin Login POST /api/auth/login...');
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@azeemgreater.com',
        password: process.env.ADMIN_PASSWORD || 'ShieldAdmin@2026!',
      }),
    });
    const adminLogin = await adminLoginRes.json();
    if (!adminLogin.success || !adminLogin.token) throw new Error('Admin login failed: ' + JSON.stringify(adminLogin));
    console.log('   ✅ Admin logged in successfully, role:', adminLogin.user.role);
    const adminToken = adminLogin.token;

    // 3. Admin creates client user with auto-generated license key
    console.log('\n3️⃣ Testing Admin User Creation POST /api/admin/users...');
    const testEmail = `client_${Date.now()}@example.com`;
    const createUserRes = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
        name: 'Test Store Owner',
        max_sites: 5,
        auto_generate_key: true,
      }),
    });
    const createUser = await createUserRes.json();
    if (!createUser.success || !createUser.license_key) throw new Error('User creation failed: ' + JSON.stringify(createUser));
    console.log('   ✅ User created successfully!');
    console.log('      Email:', testEmail);
    console.log('      Generated License Key:', createUser.license_key);
    const licenseKey = createUser.license_key;

    // 4. Client User Login
    console.log('\n4️⃣ Testing Client User Login POST /api/auth/login...');
    const userLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
      }),
    });
    const userLogin = await userLoginRes.json();
    if (!userLogin.success || !userLogin.token) throw new Error('User login failed: ' + JSON.stringify(userLogin));
    console.log('   ✅ User logged in successfully, role:', userLogin.user.role);
    const userToken = userLogin.token;

    // 5. Plugin Activation Simulation
    console.log('\n5️⃣ Testing Plugin Activation POST /api/license/activate...');
    const activateRes = await fetch(`${BASE_URL}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        license_key: licenseKey,
        domain: 'mystore.shop',
        site_url: 'https://mystore.shop',
        site_name: 'My Store Shop',
        wc_version: '10.3.0',
        wp_version: '6.7.1',
        plugin_version: '10.4.0',
      }),
    });
    const activate = await activateRes.json();
    if (!activate.success || !activate.site_secret_token) throw new Error('Activation failed: ' + JSON.stringify(activate));
    console.log('   ✅ Plugin activated successfully!');
    console.log('      Site ID:', activate.site_id);
    console.log('      Secret Token:', activate.site_secret_token);
    const siteId = activate.site_id;

    // 6. User verifies connected sites list (Browser Tab content)
    console.log('\n6️⃣ Testing User Connected Sites GET /api/sites...');
    const sitesRes = await fetch(`${BASE_URL}/api/sites`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    const sites = await sitesRes.json();
    if (!sites.success || sites.sites.length === 0) throw new Error('No connected sites found');
    console.log('   ✅ Connected sites retrieved! Count:', sites.sites.length);
    console.log('      First Site Domain:', sites.sites[0].domain);

    // 7. Verify settings fetch fallback / bridge
    console.log('\n7️⃣ Testing Settings Sync GET /api/settings/:id/settings...');
    const settingsRes = await fetch(`${BASE_URL}/api/settings/${siteId}/settings`, {
      headers: { 'Authorization': `Bearer ${userToken}` },
    });
    const settings = await settingsRes.json();
    if (!settings.success || !settings.settings) throw new Error('Settings retrieval failed');
    console.log('   ✅ Settings retrieved successfully! Title:', settings.settings.title);

    // 8. Admin Audit Logs
    console.log('\n8️⃣ Testing Audit Trail GET /api/admin/logs...');
    const logsRes = await fetch(`${BASE_URL}/api/admin/logs`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const logs = await logsRes.json();
    if (!logs.success || logs.logs.length === 0) throw new Error('No logs found');
    console.log('   ✅ Audit trail active! Total logged actions:', logs.total);
    console.log('      Recent Action:', logs.logs[0].action, 'by', logs.logs[0].actor_email);

    console.log('\n🎉 ALL 8 AUTOMATED TESTS PASSED SUCCESSFULLY! 🛡️✨\n');
  } finally {
    if (server) {
      server.close();
      console.log('🛑 Test server stopped.');
      process.exit(0);
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test Error:', err);
  if (server) server.close();
  process.exit(1);
});
