import { createClient as createAdminClient } from '@supabase/supabase-js'

interface CmsAuditInput {
  actorId: string
  actorEmail: string
  action: string
  entityType: 'cms_settings' | 'cms_upload'
  entityId?: string | null
  summary: string
  diff?: unknown
}

export async function writeCmsAudit(input: CmsAuditInput): Promise<void> {
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    await admin.from('audit_log').insert({
      actor_id: input.actorId,
      actor_email: input.actorEmail,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      diff_json: input.diff ?? null,
    })
  } catch {
    // Audit CMS best-effort agar operasi utama tidak gagal.
  }
}

