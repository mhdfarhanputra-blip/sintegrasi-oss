import type { ModuleKey } from '@/lib/access'

export const CONFIGURABLE_MODULES = [
  'dashboard',
  'keuangan',
  'persediaan',
  'bmn',
  'utilitas',
  'jadwal',
  'dipa',
  'sk',
  'perencanaan',
  'iemon',
] as const satisfies readonly ModuleKey[]

export interface SiteSettings {
  appName: string
  appFullName: string
  organizationName: string
  shortDescription: string
  loginHeadline: string
  loginSupportingText: string
  footerText: string
  websiteEnabled: boolean
  maintenanceMode: boolean
  registrationEnabled: boolean
  moduleVisibility: Record<(typeof CONFIGURABLE_MODULES)[number], boolean>
  updatedAt: string
  updatedBy: string | null
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  appName: 'SINTEGRASI',
  appFullName: 'Sistem Informasi Terintegrasi',
  organizationName: 'Organisasi Anda',
  shortDescription: 'Platform operasional terpadu.',
  loginHeadline: 'Satu sistem untuk kerja yang lebih terintegrasi.',
  loginSupportingText:
    'Mendukung pengelolaan keuangan, aset, utilitas, dokumen, agenda, dan perencanaan secara efektif, transparan, dan akuntabel.',
  footerText: 'Sintegrasi OSS',
  websiteEnabled: true,
  maintenanceMode: false,
  registrationEnabled: true,
  moduleVisibility: Object.fromEntries(CONFIGURABLE_MODULES.map((key) => [key, true])) as SiteSettings['moduleVisibility'],
  updatedAt: '',
  updatedBy: null,
}
