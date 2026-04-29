import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { connection_id } = body;

    let connection = null;
    if (connection_id) {
      const conns = await base44.asServiceRole.entities.MarketConnection.filter({ id: connection_id });
      connection = conns[0];
    } else {
      const conns = await base44.asServiceRole.entities.MarketConnection.filter({ is_active: true });
      connection = conns[0];
    }

    if (!connection) {
      return Response.json({ success: false, message: 'No active connection found. Please configure a connection first.' });
    }

    const startedAt = new Date().toISOString();
    let testResult = { success: false, message: '' };

    if (connection.source_type === 'metric_api') {
      if (!connection.base_url) {
        testResult = { success: false, message: 'base_url is required for metric_api source.' };
      } else {
        try {
          const url = connection.base_url.endsWith('/') ? connection.base_url + 'ping' : connection.base_url + '/ping';
          const headers = connection.api_key ? { 'Authorization': `Bearer ${connection.api_key}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
          const resp = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
          if (resp.ok || resp.status === 404) {
            // 404 means server is reachable but no /ping endpoint — still connected
            testResult = { success: true, message: `Connected to ${connection.base_url} (HTTP ${resp.status})` };
          } else {
            testResult = { success: false, message: `Server returned HTTP ${resp.status}` };
          }
        } catch (fetchErr) {
          testResult = { success: false, message: `Cannot reach server: ${fetchErr.message}` };
        }
      }
    } else if (connection.source_type === 'apify') {
      if (!connection.api_key) {
        testResult = { success: false, message: 'Apify token required in api_key field.' };
      } else {
        try {
          const resp = await fetch(`https://api.apify.com/v2/users/me?token=${connection.api_key}`, { signal: AbortSignal.timeout(8000) });
          const data = await resp.json();
          if (resp.ok && data.data) {
            testResult = { success: true, message: `Apify connected: ${data.data.username || data.data.id}` };
          } else {
            testResult = { success: false, message: `Apify auth failed: ${data.error?.message || 'invalid token'}` };
          }
        } catch (fetchErr) {
          testResult = { success: false, message: `Cannot reach Apify: ${fetchErr.message}` };
        }
      }
    } else if (connection.source_type === 'metric_csv' || connection.source_type === 'manual_import') {
      testResult = { success: true, message: `Source type "${connection.source_type}" is manual/CSV — no live connection required. Ready to import.` };
    } else {
      testResult = { success: false, message: `Unknown source type: ${connection.source_type}` };
    }

    // Update connection status
    await base44.asServiceRole.entities.MarketConnection.update(connection.id, {
      status: testResult.success ? 'connected' : 'error',
      last_error: testResult.success ? null : testResult.message,
    });

    return Response.json({
      success: testResult.success,
      message: testResult.message,
      connection_name: connection.connection_name,
      source_type: connection.source_type,
      tested_at: startedAt,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});