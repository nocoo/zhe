/**
 * Quick test script to verify D1 connection works.
 * Run with: npx tsx scripts/test-d1.ts
 */

async function testD1Connection() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    console.error('❌ Missing environment variables');
    console.log('Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }

  console.log('🔗 Testing D1 connection...');
  console.log(`   Account: ${accountId}`);
  console.log(`   Database: ${databaseId}`);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: 'SELECT name FROM sqlite_master WHERE type="table"',
          params: [],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ D1 query failed:', error);
      process.exit(1);
    }

    const data = await response.json();

    if (!data.success) {
      console.error('❌ D1 query failed:', data.errors);
      process.exit(1);
    }

    const tables = data.result[0]?.results || [];
    console.log('✅ Connection successful!');
    console.log('📋 Tables in database:');
    tables.forEach((t: { name: string }) => console.log(`   - ${t.name}`));

    // Test inserting a link
    console.log('\n🧪 Testing link creation...');
    const createResult = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: `INSERT INTO links (user_id, original_url, slug, is_custom, clicks, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING *`,
          params: ['test-user', 'https://example.com', 'test-' + Date.now(), 0, 0, Date.now()],
        }),
      }
    );

    const createData = await createResult.json();
    if (createData.success) {
      console.log('✅ Link created successfully!');
      console.log('   ', createData.result[0]?.results[0]);
    } else {
      console.log('⚠️  Link creation failed (might be a duplicate):', createData.errors);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testD1Connection();
