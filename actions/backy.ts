'use server';

import { getScopedDB } from '@/lib/auth-context';
import { APP_VERSION } from '@/lib/version';
import {
  validateBackyConfig,
  maskApiKey,
  getBackyEnvironment,
  buildBackyTag,
  type BackyHistoryResponse,
  type BackyPushDetail,
} from '@/models/backy';
import { serializeLinksForExport, BACKUP_SCHEMA_VERSION, type BackupEnvelope } from '@/models/settings';

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
  data?: BackyPushDetail;
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) return { success: false, error: 'Unauthorized' };

    const config = await db.getBackySettings();
    if (!config) return { success: false, error: 'Backy 未配置' };

    const start = Date.now();

    // Gather data for export
    const [links, folders, tags, linkTags] = await Promise.all([
      db.getLinks(),
      db.getFolders(),
      db.getTags(),
      db.getLinkTags(),
    ]);

    const exported = serializeLinksForExport(links);
    const backupData: BackupEnvelope = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      links: exported,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        icon: f.icon,
        createdAt: new Date(f.createdAt).toISOString(),
      })),
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        createdAt: new Date(t.createdAt).toISOString(),
      })),
      linkTags: linkTags.map((lt) => ({
        linkId: lt.linkId,
        tagId: lt.tagId,
      })),
    };
    const json = JSON.stringify(backupData);

    // Build tag
    const tag = buildBackyTag(APP_VERSION, {
      links: links.length,
      folders: folders.length,
      tags: tags.length,
    });

    const fileName = `zhe-backup-${new Date().toISOString().slice(0, 10)}.json`;

    // Push to Backy as multipart/form-data
    const form = new FormData();
    const blob = new Blob([json], { type: 'application/json' });
    form.append('file', blob, fileName);
    form.append('environment', getBackyEnvironment());
    form.append('tag', tag);

    const requestMeta = {
      tag,
      fileName,
      fileSizeBytes: json.length,
      backupStats: {
        links: links.length,
        folders: folders.length,
        tags: tags.length,
        linkTags: linkTags.length,
      } as Record<string, number>,
    };

    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });

    const durationMs = Date.now() - start;

    if (!res.ok) {
      let body: unknown;
      const text = await res.text().catch(() => '');
      try { body = JSON.parse(text); } catch { body = text || null; }
      return {
        success: false,
        data: {
          ok: false,
          message: `推送失败 (${res.status})`,
          durationMs,
          request: requestMeta,
          response: { status: res.status, body },
        },
        error: `推送失败 (${res.status})`,
      };
    }

    // Success — response body consumed but not needed; detail is built from request metadata
    await res.json();
    return {
      success: true,
      data: {
        ok: true,
        message: `推送成功 (${durationMs}ms)`,
        durationMs,
        request: requestMeta,
      },
    };
  } catch (error) {
    console.error('Failed to push backup:', error);
    return { success: false, error: '推送备份失败' };
  }
}
