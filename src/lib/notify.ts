import { createClient as createAdminClient } from '@supabase/supabase-js'
import { buildNotificationEmailHtml, buildRingkasanEmailHtml, sendEmail, type NotificationEmailItem } from './email'

/**
 * Helper server-side untuk menaruh notifikasi in-app.
 * Memakai service-role agar bisa menyisipkan notifikasi ke user lain
 * (mis. memberi tahu semua Admin saat pendaftar baru masuk).
 */

interface NotifyInput {
  userId: string
  type: string
  title: string
  message?: string | null
  link?: string | null
  /** Bila true, kirim juga notifikasi via email (best-effort). */
  email?: boolean
  /**
   * Kunci anti-duplikat untuk notifikasi berulang (mis. cron harian).
   *
   * Notifikasi dengan `type` + `dedupe_key` yang sama untuk user yang sama
   * dilewati selama `dedupeWindowMs` terakhir. Tanpa ini cron ringkasan harian
   * akan menumpuk satu baris per hari selamanya walaupun isinya identik.
   */
  dedupeKey?: string | null
  dedupeWindowMs?: number
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Mengirim email notifikasi ke daftar penerima secara paralel (best-effort).
async function dispatchEmails(
  recipients: string[],
  payload: { title: string; message?: string | null; link?: string | null },
): Promise<void> {
  const targets = recipients.filter((to) => Boolean(to))
  if (!targets.length) return
  const html = buildNotificationEmailHtml({
    title: payload.title,
    message: payload.message,
    link: payload.link,
  })
  await Promise.allSettled(
    targets.map((to) =>
      sendEmail({ to, subject: payload.title, html }),
    ),
  )
}

interface RecipientPref {
  id: string
  email: string | null
  notif_inapp_enabled?: boolean | null
  notif_email_enabled?: boolean | null
}

/** Kolom preferensi pada profiles; di-select bersama email penerima. */
const RECIPIENT_FIELDS_LENGKAP = 'id, email, notif_inapp_enabled, notif_email_enabled'
const RECIPIENT_FIELDS_DASAR = 'id, email'

/**
 * Kolom preferensi mana yang terbukti tersedia di database ini.
 *
 * `migration_v22_preferensi_notifikasi.sql` menambah `notif_inapp_enabled` dan
 * `notif_email_enabled`. Di produksi migrasi itu belum dijalankan, dan
 * PostgREST menolak SELURUH kueri bila satu kolom saja tidak ada
 * (PGRST/42703) — akibatnya setiap pemanggilan notifikasi gagal senyap dan
 * tidak satu pun notifikasi pernah sampai ke pengguna (termasuk notifikasi
 * pendaftar baru dan transaksi besar).
 *
 * Deteksi dilakukan sekali per proses, lalu hasilnya dipakai ulang. Bila
 * kolom preferensi tidak ada, sistem memakai kolom dasar dengan perilaku
 * default "notifikasi aktif", sehingga tetap berfungsi sebelum migrasi jalan.
 */
type ModePreferensi = 'lengkap' | 'dasar'
let modePreferensiCache: ModePreferensi | null = null

async function tentukanModePreferensi(
  admin: ReturnType<typeof adminClient>,
): Promise<ModePreferensi> {
  if (modePreferensiCache) return modePreferensiCache
  const { error } = await admin.from('profiles').select(RECIPIENT_FIELDS_LENGKAP).limit(1)
  modePreferensiCache = error ? 'dasar' : 'lengkap'
  if (error) {
    // Bukan galat fatal: dicatat sekali agar operator tahu migrasi v22 belum
    // dijalankan di lingkungan ini.
    console.warn(
      '[notify] kolom preferensi notifikasi tidak tersedia, memakai default aktif:',
      error.message,
    )
  }
  return modePreferensiCache
}

/** Ambil daftar penerima role dengan kolom preferensi yang benar-benar ada. */
async function ambilPenerima(
  admin: ReturnType<typeof adminClient>,
  roles: string[],
): Promise<RecipientPref[]> {
  const mode = await tentukanModePreferensi(admin)
  const fields = mode === 'lengkap' ? RECIPIENT_FIELDS_LENGKAP : RECIPIENT_FIELDS_DASAR
  const { data } = await admin
    .from('profiles')
    .select(fields)
    .in('role', roles)
    .eq('status', 'Aktif')
  return (data ?? []) as unknown as RecipientPref[]
}

// Anggap preferensi aktif bila kolom belum ada / bernilai null (default opt-in).
function wantsInApp(pref: Pick<RecipientPref, 'notif_inapp_enabled'>): boolean {
  return pref.notif_inapp_enabled !== false
}

function wantsEmail(pref: Pick<RecipientPref, 'notif_email_enabled'>): boolean {
  return pref.notif_email_enabled !== false
}

/** Jendela default anti-duplikat: 20 jam (aman untuk cron harian terlambat). */
const DEDUPE_WINDOW_MS_DEFAULT = 20 * 60 * 60 * 1000

/**
 * Memeriksa apakah notifikasi serupa sudah ada dalam jendela waktu tertentu.
 *
 * Dipakai untuk mencegah penumpukan notifikasi berulang dari cron. Bila
 * pemeriksaan gagal (kolom `dedupe_key` belum ada karena migrasi belum jalan),
 * fungsi mengembalikan `false` sehingga notifikasi tetap dikirim — perilaku
 * aman yang sama seperti sebelum fitur ini ada.
 */
async function sudahAdaNotifikasiSerupa(
  admin: ReturnType<typeof adminClient>,
  input: NotifyInput,
): Promise<boolean> {
  if (!input.dedupeKey) return false
  const windowMs = input.dedupeWindowMs ?? DEDUPE_WINDOW_MS_DEFAULT
  const batas = new Date(Date.now() - windowMs).toISOString()
  const { data, error } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', input.userId)
    .eq('type', input.type)
    .eq('dedupe_key', input.dedupeKey)
    .gte('created_at', batas)
    .limit(1)
  if (error) return false
  return Boolean(data?.length)
}

export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    const admin = adminClient()
    const mode = await tentukanModePreferensi(admin)
    const { data: pref } = await admin
      .from('profiles')
      .select(mode === 'lengkap' ? RECIPIENT_FIELDS_LENGKAP : RECIPIENT_FIELDS_DASAR)
      .eq('id', input.userId)
      .maybeSingle()

    // Bila profil tak ditemukan, tetap kirim in-app (perilaku aman lama).
    if (!pref || wantsInApp(pref as unknown as RecipientPref)) {
      if (!(await sudahAdaNotifikasiSerupa(admin, input))) {
        const dasar = {
          user_id: input.userId,
          type: input.type,
          title: input.title,
          message: input.message ?? null,
          link: input.link ?? null,
        }
        let { error } = await admin
          .from('notifications')
          .insert({ ...dasar, dedupe_key: input.dedupeKey ?? null })
        // Kolom dedupe_key belum ada (migrasi v26 belum jalan) → pakai skema lama.
        if (error && /dedupe_key/.test(error.message ?? '')) {
          const ulang = await admin.from('notifications').insert(dasar)
          error = ulang.error
        }
        if (error) {
          console.error('[notify] gagal menyisipkan notifikasi:', error.message)
        }
      }
    }

    const prefEmail = (pref as unknown as RecipientPref | null)?.email
    if (input.email && prefEmail && wantsEmail(pref as unknown as RecipientPref)) {
      await dispatchEmails([prefEmail], input)
    }
  } catch (err) {
    // Notifikasi bersifat best-effort; jangan gagalkan operasi utama, tetapi
    // jangan pula hilang tanpa jejak di log.
    console.error('[notify] gagal mengirim notifikasi:', err)
  }
}

/**
 * Kirim SATU email gabungan ke semua pengguna aktif dengan role tertentu.
 *
 * Dipakai cron yang memproses banyak baris sekaligus: notifikasi in-app tetap
 * satu per baris (agar dapat ditandai dibaca sendiri-sendiri), tetapi email
 * digabung agar tidak membanjiri kotak masuk dan tidak memicu pembatasan SMTP.
 * Best-effort: kegagalan tidak pernah melempar.
 */
export async function kirimEmailRingkasanByRole(
  role: string | string[],
  payload: {
    title: string
    intro?: string | null
    items: NotificationEmailItem[]
    link?: string | null
  },
): Promise<void> {
  if (!payload.items.length) return
  try {
    const admin = adminClient()
    const roles = Array.isArray(role) ? role : [role]
    const penerima = await ambilPenerima(admin, roles)
    if (!penerima.length) return

    const emails = penerima
      .filter(wantsEmail)
      .map((p) => p.email)
      .filter((email): email is string => Boolean(email))
    if (!emails.length) return

    const html = buildRingkasanEmailHtml(payload)
    await Promise.allSettled(
      emails.map((to) => sendEmail({ to, subject: payload.title, html })),
    )
  } catch {
    // best-effort
  }
}

/**
 * Kirim notifikasi in-app ke semua pengguna aktif dengan role tertentu.
 *
 * `email` mengirim satu email per penerima. Untuk kejadian yang menghasilkan
 * BANYAK peringatan sekaligus, pakai `emailDigest` agar penerima menerima satu
 * email gabungan alih-alih puluhan email terpisah.
 */
export async function notifyUsersByRole(
  role: string | string[],
  payload: Omit<NotifyInput, 'userId'> & {
    /** Gabungkan seluruh baris yang dihasilkan satu proses menjadi satu email. */
    emailDigest?: boolean
  },
): Promise<{ terkirim: number }> {
  // Konvensi nilai `terkirim`:
  //   > 0  jumlah penerima yang mendapat notifikasi baru
  //   -1   tidak ada penerima baru karena sudah ada pada jendela dedupe (bukan galat)
  //    0   gagal (galat dicatat di log)
  try {
    const admin = adminClient()
    const roles = Array.isArray(role) ? role : [role]
    const recipients = await ambilPenerima(admin, roles)
    if (!recipients.length) return { terkirim: -1 }

    let inAppTargets = recipients.filter(wantsInApp)

    // Saring penerima yang sudah menerima notifikasi serupa dalam jendela
    // dedupe — satu kueri untuk seluruh penerima, bukan per penerima.
    if (payload.dedupeKey && inAppTargets.length) {
      const windowMs = payload.dedupeWindowMs ?? DEDUPE_WINDOW_MS_DEFAULT
      const batas = new Date(Date.now() - windowMs).toISOString()
      const { data: sudah } = await admin
        .from('notifications')
        .select('user_id')
        .eq('type', payload.type)
        .eq('dedupe_key', payload.dedupeKey)
        .gte('created_at', batas)
        .in('user_id', inAppTargets.map((p) => p.id))
      const sudahSet = new Set((sudah ?? []).map((r) => (r as { user_id: string }).user_id))
      inAppTargets = inAppTargets.filter((p) => !sudahSet.has(p.id))
    }

    if (inAppTargets.length) {
      // Bila tabel notifications belum ada di lingkungan ini (migrasi v4/v26
      // belum dijalankan), `dedupe_key` juga tidak ada. Coba dengan kolom
      // dedupe dulu, lalu jatuh ke skema lama agar notifikasi tidak hilang
      // total hanya karena satu kolom tambahan.
      const baris = inAppTargets.map((p) => ({
        user_id: p.id,
        type: payload.type,
        title: payload.title,
        message: payload.message ?? null,
        link: payload.link ?? null,
      }))
      let { error } = await admin
        .from('notifications')
        .insert(baris.map((b) => ({ ...b, dedupe_key: payload.dedupeKey ?? null })))

      if (error && /dedupe_key/.test(error.message ?? '')) {
        // Kolom belum ada → ulangi tanpa dedupe_key (kompatibel v4).
        const ulang = await admin.from('notifications').insert(baris)
        error = ulang.error
      }

      // Galat penyisipan tidak lagi ditelan diam-diam: pemanggil cron memakai
      // jumlah ini untuk melaporkan kegagalan yang sebenarnya terjadi.
      if (error) {
        console.error('notifyUsersByRole: gagal menyisipkan notifikasi', error.message)
        return { terkirim: 0 }
      }
    }

    if (payload.email && !payload.emailDigest) {
      const emails = recipients
        .filter(wantsEmail)
        .map((p) => p.email)
        .filter((email): email is string => Boolean(email))
      await dispatchEmails(emails, payload)
    }
    return { terkirim: inAppTargets.length === 0 ? -1 : inAppTargets.length }
  } catch (err) {
    console.error('notifyUsersByRole: gagal total', err)
    return { terkirim: 0 }
  }
}
