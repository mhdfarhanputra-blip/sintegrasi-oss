export const ROLES = [
  'Admin',
  'Bendahara',
  'BMN',
  'Teknis',
  'Perencanaan',
  'PPSPM',
  'PPK',
  'Operator Keuangan',
  'Pengusul',
] as const

export type AppRole = (typeof ROLES)[number]

/** Label tampilan untuk setiap role (value DB tetap sama) */
export const ROLE_LABELS: Record<AppRole, string> = {
  Admin: 'Admin',
  Bendahara: 'Bendahara',
  BMN: 'BMN',
  Teknis: 'Operator Satker',
  Perencanaan: 'Operator Perencanaan',
  PPSPM: 'PPSPM',
  PPK: 'PPK',
  'Operator Keuangan': 'Operator Keuangan',
  Pengusul: 'Pengusul',
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as AppRole] ?? role
}

export const MODULE_ROLES = {
  dashboard: ['Admin', 'Bendahara', 'BMN', 'Teknis', 'Perencanaan', 'PPSPM', 'PPK', 'Operator Keuangan'],
  keuangan: ['Admin', 'Bendahara', 'PPSPM', 'Operator Keuangan'],
  persediaan: ['Admin', 'Bendahara', 'BMN'],
  bmn: ['Admin', 'BMN'],
  utilitas: ['Admin', 'Teknis', 'Perencanaan', 'PPK', 'Pengusul'],
  dipa: ['Admin', 'Perencanaan', 'Teknis', 'Bendahara', 'BMN', 'PPSPM', 'PPK', 'Operator Keuangan'],
  sk: ['Admin', 'Bendahara', 'BMN', 'Teknis', 'Perencanaan', 'PPSPM', 'PPK', 'Operator Keuangan'],
  jadwal: ['Admin', 'Bendahara', 'BMN', 'Teknis', 'Perencanaan', 'PPSPM', 'PPK', 'Operator Keuangan'],
  perencanaan: ['Admin', 'Perencanaan', 'Bendahara', 'Teknis', 'BMN', 'PPSPM', 'PPK', 'Operator Keuangan'],
  iemon: ['Admin', 'Perencanaan', 'Teknis', 'Bendahara', 'BMN', 'PPSPM', 'PPK', 'Operator Keuangan'],
  // Data paket kontraktual SIPP: memuat nama rekanan & nilai kontrak,
  // jadi aksesnya disamakan dengan modul progres (iemon), bukan publik.
  sipp: ['Admin', 'Perencanaan', 'Teknis', 'Bendahara', 'BMN', 'PPSPM', 'PPK', 'Operator Keuangan'],
  pengguna: ['Admin'],
  cms: ['Admin'],
  audit: ['Admin'],
  // Command Center cron: operasional sistem, khusus Admin.
  cron: ['Admin'],
} as const satisfies Record<string, readonly AppRole[]>

export type ModuleKey = keyof typeof MODULE_ROLES

export const MODULE_ALIASES: Record<string, ModuleKey> = {
  keuangan: 'keuangan',
  persediaan: 'persediaan',
  bmn: 'bmn',
  utilitas: 'utilitas',
  dipa: 'dipa',
  rkakl: 'dipa',
  'rka-kl': 'dipa',
  sk: 'sk',
  jadwal: 'jadwal',
  rapat: 'jadwal',
  kegiatan: 'jadwal',
  perencanaan: 'perencanaan',
  iemon: 'iemon',
  'i-emon': 'iemon',
  sipp: 'sipp',
  'paket-kontraktual': 'sipp',
  kontraktual: 'sipp',
  // Menu CMS (pusat unggah dokumen) mengirim modul 'cms'. Tanpa alias ini
  // normalizeModuleKey mengembalikan null sehingga unggahan ditolak 400 —
  // artinya seluruh unggahan lewat CMS gagal.
  cms: 'cms',
  dokumen: 'cms',
  arsip: 'cms',
}

export const EXPORT_TABLES = {
  keuangan: 'keuangan',
  persediaan: 'persediaan',
  bmn: 'bmn',
  utilitas: 'utilitas',
  dipa: 'dokumen_dipa',
  sk: 'dokumen_sk',
  // Agenda kegiatan: sebelumnya satu-satunya modul data tabular tanpa ekspor,
  // sehingga rekap rapat/kegiatan harus disalin manual oleh operator.
  jadwal: 'jadwal_kegiatan',
} as const satisfies Partial<Record<ModuleKey, string>>

const ROUTE_MODULES: Array<[string, ModuleKey]> = [
  ['/keuangan', 'keuangan'],
  ['/persediaan', 'persediaan'],
  ['/bmn', 'bmn'],
  ['/utilitas', 'utilitas'],
  ['/dipa', 'dipa'],
  ['/sk', 'sk'],
  ['/jadwal', 'jadwal'],
  ['/perencanaan', 'perencanaan'],
  ['/iemon', 'iemon'],
  ['/pengguna', 'pengguna'],
  ['/cms', 'cms'],
  ['/audit', 'audit'],
  ['/', 'dashboard'],
]

export function isAppRole(role: string | null | undefined): role is AppRole {
  return ROLES.includes(role as AppRole)
}

export function canAccessModule(role: string | null | undefined, module: ModuleKey): boolean {
  return isAppRole(role) && (MODULE_ROLES[module] as readonly AppRole[]).includes(role)
}

export function moduleForPath(pathname: string): ModuleKey | null {
  return ROUTE_MODULES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? null
}

export function normalizeModuleKey(value: string | null | undefined): ModuleKey | null {
  if (!value) return null
  const key = value.trim().toLowerCase().replace(/\s+/g, '-')
  return MODULE_ALIASES[key] ?? null
}
