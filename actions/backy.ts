'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';
import { APP_VERSION } from '@/lib/version';
import {
  validateBackyConfig,
  maskApiKey,
  getBackyEnvironment,
  buildBackyTag,
  type BackyHistoryResponse,
  type BackyPushResult,
} from '@/models/backy';
import { serializeLinksForExport } from '@/models/settings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getScopedDB(): Promise<ScopedDB | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return new ScopedDB(userId);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Get the current Backy config (URL + masked key). */
export async function getBackyConfig(): Promise<{
  success: boolean;
  data?: { webhookUrl: string; maskedApiKey: string };
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const config = await db.getBackySettings();
    if (!config) return { success: true, data: undefined };

    return {
      success: true,
      data: {
        webhookUrl: config.webhookUrl,
        maskedApiKey: maskApiKey(config.apiKey),
      },
    };
  } catch (error) {
    console.error('Failed to get Backy config:', error);
    return { success: false, error: 'Failed to load Backy config' };
  }
}

/** Save Backy config (webhook URL + API key). */
export async function saveBackyConfig(config: {
  webhookUrl: string;
  apiKey: string;
}): Promise<{ success: boolean; data?: { webhookUrl: string; maskedApiKey: string }; error?: string }> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const validation = validateBackyConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    await db.upsertBackySettings({
      webhookUrl: config.webhookUrl.trim(),
      apiKey: config.apiKey.trim(),
    });

    return {
      success: true,
      data: {
        webhookUrl: config.webhookUrl.trim(),
        maskedApiKey: maskApiKey(config.apiKey.trim()),
      },
    };
  } catch (error) {
    console.error('Failed to save Backy config:', error);
    return { success: false, error: 'Failed to save Backy config' };
  }
}

/** Test connection to the Backy webhook (HEAD request). */
export async function testBackyConnection(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const config = await db.getBackySettings();
    if (!config) return { success: false, error: 'Backy 未配置' };

    const res = await fetch(config.webhookUrl, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });

    if (!res.ok) {
      return { success: false, error: `连接失败 (${res.status})` };
    }

    return { success: true };
  } catch (error) {
    console.error('Backy connection test failed:', error);
    return { success: false, error: '连接失败：无法访问 Backy 服务' };
  }
}

/** Fetch backup history from Backy. */
export async function fetchBackyHistory(): Promise<{
  success: boolean;
  data?: BackyHistoryResponse;
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const config = await db.getBackySettings();
    if (!config) return { success: false, error: 'Backy 未配置' };

    const res = await fetch(config.webhookUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });

    if (!res.ok) {
      return { success: false, error: `获取历史失败 (${res.status})` };
    }

    const data: BackyHistoryResponse = await res.json();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch Backy history:', error);
    return { success: false, error: '获取备份历史失败' };
  }
}

/** Export all data and push a backup to Backy. */
export async function pushBackup(): Promise<{
  success: boolean;
  data?: BackyPushResult;
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const config = await db.getBackySettings();
    if (!config) return { success: false, error: 'Backy 未配置' };

    // Gather data for export
    const [links, folders, tags] = await Promise.all([
      db.getLinks(),
      db.getFolders(),
      db.getTags(),
    ]);

    const exported = serializeLinksForExport(links);
    const backupData = { links: exported, folders, tags };

    // Build tag
    const tag = buildBackyTag(APP_VERSION, {
      links: links.length,
      folders: folders.length,
      tags: tags.length,
    });

    // Push to Backy as multipart/form-data
    const form = new FormData();
    const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
    form.append('file', blob, 'backup.json');
    form.append('environment', getBackyEnvironment());
    form.append('tag', tag);

    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      return { success: false, error: `推送失败 (${res.status})` };
    }

    const result: BackyPushResult = await res.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to push backup:', error);
    return { success: false, error: '推送备份失败' };
  }
}
