import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Helper pengiriman email via SMTP (nodemailer).
 * Bersifat aman/best-effort: bila env tidak lengkap atau pengiriman gagal,
 * fungsi tidak melempar error dan mengembalikan false.
 */

const DEFAULT_SMTP_PORT = 587
const SECURE_SMTP_PORT = 465
const DEFAULT_FROM = process.env.SMTP_FROM ?? 'SINTEGRASI <no-reply@example.com>'
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000'

const BRAND_NAVY = '#0c1e3e'
const BRAND_GOLD = '#c79a4a'

interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
}

interface NotificationEmailInput {
  title: string
  message?: string | null
  link?: string | null
}

/** Satu baris ringkasan untuk email gabungan (mis. daftar SLA terlampaui). */
export interface NotificationEmailItem {
  title: string
  message?: string | null
}

// Membaca port SMTP dari env dengan fallback default.
function readSmtpPort(): number {
  const raw = process.env.SMTP_PORT
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_SMTP_PORT
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SMTP_PORT
}

// True hanya jika host, user, dan password tersedia.
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
  )
}

let cachedTransporter: Transporter | null = null

// Membuat transporter sekali (lazy singleton).
function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter
  const port = readSmtpPort()
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === SECURE_SMTP_PORT,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })
  return cachedTransporter
}

// Mengirim email best-effort. Tidak melempar; return false saat gagal.
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!isEmailConfigured()) return false
  try {
    const from = process.env.SMTP_FROM || DEFAULT_FROM
    await getTransporter().sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
    return true
  } catch (err) {
    console.error(`[email] Gagal mengirim ke ${input.to}:`, err)
    return false
  }
}

// Escape teks agar aman dimasukkan ke dalam HTML (cegah HTML injection).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Menggabungkan path link dengan base URL aplikasi.
function buildAppUrl(link?: string | null): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || APP_BASE_URL
  if (!link) return base
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedLink = link.startsWith('/') ? link : `/${link}`
  return `${normalizedBase}${normalizedLink}`
}

// Membangun HTML email notifikasi berbranding SINTEGRASI (email-safe inline CSS).
export function buildNotificationEmailHtml(input: NotificationEmailInput): string {
  const safeTitle = escapeHtml(input.title)
  const safeMessage = input.message ? escapeHtml(input.message) : ''
  const url = buildAppUrl(input.link)
  const messageBlock = safeMessage
    ? `<p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">${safeMessage}</p>`
    : ''
  return `<!DOCTYPE html>
<html lang="id">
<body style="margin:0;padding:24px;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="background-color:${BRAND_NAVY};padding:20px 28px;">
        <span style="color:${BRAND_GOLD};font-size:18px;font-weight:bold;letter-spacing:1px;">SINTEGRASI</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 16px;color:${BRAND_NAVY};font-size:20px;line-height:1.4;">${safeTitle}</h1>
        ${messageBlock}
        <a href="${url}" style="display:inline-block;background-color:${BRAND_GOLD};color:${BRAND_NAVY};text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;font-size:14px;">Buka aplikasi</a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">Email otomatis dari SINTEGRASI, mohon tidak membalas.</p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * HTML email gabungan: satu judul, satu pesan pengantar, lalu daftar butir.
 *
 * Dipakai saat satu kejadian menghasilkan banyak peringatan (mis. banyak
 * permohonan utilitas melewati SLA). Sebelumnya tiap baris mengirim email
 * sendiri, sehingga satu kali cron bisa mengirim puluhan email ke orang yang
 * sama — berisiko diblokir penyedia SMTP.
 */
export function buildRingkasanEmailHtml(input: {
  title: string
  intro?: string | null
  items: NotificationEmailItem[]
  link?: string | null
}): string {
  const safeTitle = escapeHtml(input.title)
  const safeIntro = input.intro ? escapeHtml(input.intro) : ''
  const url = buildAppUrl(input.link)
  const introBlock = safeIntro
    ? `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">${safeIntro}</p>`
    : ''
  const items = input.items
    .map((item) => {
      const t = escapeHtml(item.title)
      const m = item.message ? escapeHtml(item.message) : ''
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
        <div style="color:${BRAND_NAVY};font-size:14px;font-weight:bold;">${t}</div>
        ${m ? `<div style="color:#64748b;font-size:13px;line-height:1.5;margin-top:2px;">${m}</div>` : ''}
      </td></tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="id">
<body style="margin:0;padding:24px;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="background-color:${BRAND_NAVY};padding:20px 28px;">
        <span style="color:${BRAND_GOLD};font-size:18px;font-weight:bold;letter-spacing:1px;">SINTEGRASI</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 16px;color:${BRAND_NAVY};font-size:20px;line-height:1.4;">${safeTitle}</h1>
        ${introBlock}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
        <div style="margin-top:24px;">
          <a href="${url}" style="display:inline-block;background-color:${BRAND_GOLD};color:${BRAND_NAVY};text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;font-size:14px;">Buka aplikasi</a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">Email otomatis dari SINTEGRASI, mohon tidak dibalas.</p>
      </td>
    </tr>
  </table>
</body>
</html>`
}
