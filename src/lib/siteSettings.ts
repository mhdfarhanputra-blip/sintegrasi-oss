import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cache } from 'react'
import type { ModuleKey } from '@/lib/access'
import {
  CONFIGURABLE_MODULES,
  DEFAULT_SITE_SETTINGS,
  type SiteSettings,
} from '@/lib/siteSettingsShared'

export {
  CONFIGURABLE_MODULES,
  DEFAULT_SITE_SETTINGS,
  type SiteSettings,
} from '@/lib/siteSettingsShared'

export const SITE_SETTINGS_BUCKET = 'dokumen'
export const SITE_SETTINGS_PATH = 'cms/site-settings.json'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return cleaned ? cleaned.slice(0, maxLength) : fallback
}

export function normalizeSiteSettings(input: Partial<SiteSettings> | null | undefined): SiteSettings {
  const visibility = { ...DEFAULT_SITE_SETTINGS.moduleVisibility }
  for (const key of CONFIGURABLE_MODULES) {
    if (typeof input?.moduleVisibility?.[key] === 'boolean') {
      visibility[key] = input.moduleVisibility[key]
    }
  }

  return {
    appName: cleanText(input?.appName, DEFAULT_SITE_SETTINGS.appName, 40),
    appFullName: cleanText(input?.appFullName, DEFAULT_SITE_SETTINGS.appFullName, 120),
    organizationName: cleanText(input?.organizationName, DEFAULT_SITE_SETTINGS.organizationName, 120),
    shortDescription: cleanText(input?.shortDescription, DEFAULT_SITE_SETTINGS.shortDescription, 240),
    loginHeadline: cleanText(input?.loginHeadline, DEFAULT_SITE_SETTINGS.loginHeadline, 160),
    loginSupportingText: cleanText(input?.loginSupportingText, DEFAULT_SITE_SETTINGS.loginSupportingText, 400),
    footerText: cleanText(input?.footerText, DEFAULT_SITE_SETTINGS.footerText, 160),
    websiteEnabled: input?.websiteEnabled !== false,
    maintenanceMode: input?.maintenanceMode === true,
    registrationEnabled: input?.registrationEnabled !== false,
    moduleVisibility: visibility,
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : '',
    updatedBy: typeof input?.updatedBy === 'string' ? input.updatedBy : null,
  }
}

async function ensureBucket(): Promise<void> {
  const admin = adminClient()
  const { data } = await admin.storage.getBucket(SITE_SETTINGS_BUCKET)
  if (!data) {
    const { error } = await admin.storage.createBucket(SITE_SETTINGS_BUCKET, { public: false })
    if (error && !error.message.includes('already exists')) throw error
  }
}

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const admin = adminClient()
    const { data, error } = await admin.storage.from(SITE_SETTINGS_BUCKET).download(SITE_SETTINGS_PATH)
    if (!error && data) {
      return normalizeSiteSettings(JSON.parse(await data.text()) as Partial<SiteSettings>)
    }
  } catch {
    // Gunakan default bila konfigurasi belum pernah disimpan.
  }
  return { ...DEFAULT_SITE_SETTINGS, moduleVisibility: { ...DEFAULT_SITE_SETTINGS.moduleVisibility } }
})

export async function saveSiteSettings(
  input: Partial<SiteSettings>,
  actorEmail: string,
): Promise<SiteSettings> {
  await ensureBucket()
  const settings = normalizeSiteSettings({
    ...input,
    updatedAt: new Date().toISOString(),
    updatedBy: actorEmail,
  })
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
  const { error } = await adminClient().storage
    .from(SITE_SETTINGS_BUCKET)
    .upload(SITE_SETTINGS_PATH, blob, { contentType: 'application/json', upsert: true })
  if (error) throw error
  return settings
}

export function isModuleVisible(settings: SiteSettings, module: ModuleKey): boolean {
  if (!(module in settings.moduleVisibility)) return true
  return settings.moduleVisibility[module as keyof SiteSettings['moduleVisibility']] !== false
}
