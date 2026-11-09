import { createSign } from 'crypto'

type ServiceAccount = {
  client_email: string
  private_key: string
}

export type JadwalGooglePayload = {
  judul: string
  jenis: string
  mulai: string
  selesai: string
  lokasi: string | null
  penyelenggara: string | null
  peserta: string | null
  deskripsi: string | null
  linkForm: string | null
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as ServiceAccount
  } catch {
    return null
  }
}

async function getAccessToken(scopes: string[]): Promise<string | null> {
  const account = serviceAccount()
  if (!account?.client_email || !account.private_key) return null

  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: scopes.join(' '),
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }))
  const unsigned = `${header}.${claim}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key)
  const assertion = `${unsigned}.${base64Url(signature)}`

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) return null
  const json = await res.json() as { access_token?: string }
  return json.access_token ?? null
}

export function googleIntegrationStatus() {
  const sheetId = process.env.GOOGLE_SHEET_ID
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  return {
    formUrl: process.env.GOOGLE_FORM_JADWAL_URL || process.env.NEXT_PUBLIC_GOOGLE_FORM_JADWAL_URL || null,
    sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : null,
    calendarUrl: calendarId ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}` : null,
    calendarConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 && calendarId),
    sheetConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 && sheetId),
  }
}

function cell(row: string[], index: number): string {
  return String(row[index] ?? '').trim()
}

function isoJakartaDateTime(day: number, month: number, year: number, hour = 0, minute = 0): string | null {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year) || !Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  const dateOnlyCheck = new Date(Date.UTC(year, month - 1, day))
  if (
    dateOnlyCheck.getUTCFullYear() !== year ||
    dateOnlyCheck.getUTCMonth() !== month - 1 ||
    dateOnlyCheck.getUTCDate() !== day
  ) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`
}

function parseSheetDateParts(value: string): { day: number; month: number; year: number; hour?: number; minute?: number } | null {
  const raw = value.trim()
  if (!raw) return null

  const localMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?$/)
  if (localMatch) {
    const [, dd, mm, yyyy, hh, min] = localMatch
    return {
      day: Number(dd),
      month: Number(mm),
      year: Number(yyyy),
      hour: hh ? Number(hh) : undefined,
      minute: min ? Number(min) : undefined,
    }
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/)
  if (isoMatch) {
    const [, yyyy, mm, dd, hh, min] = isoMatch
    return {
      day: Number(dd),
      month: Number(mm),
      year: Number(yyyy),
      hour: hh ? Number(hh) : undefined,
      minute: min ? Number(min) : undefined,
    }
  }

  return null
}

function parseSheetDate(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null

  const parts = parseSheetDateParts(raw)
  if (parts) {
    return isoJakartaDateTime(parts.day, parts.month, parts.year, parts.hour ?? 0, parts.minute ?? 0)
  }

  const native = new Date(raw)
  return Number.isNaN(native.getTime()) ? null : native.toISOString()
}

function parseSheetDateOnly(value: string): { day: number; month: number; year: number } | null {
  const raw = value.trim()
  if (!raw) return null

  const parts = parseSheetDateParts(raw)
  if (parts) return { day: parts.day, month: parts.month, year: parts.year }

  const native = new Date(raw)
  if (Number.isNaN(native.getTime())) return null
  return {
    day: native.getUTCDate(),
    month: native.getUTCMonth() + 1,
    year: native.getUTCFullYear(),
  }
}

function parseSheetTime(value: string): { hour: number; minute: number } | null {
  const raw = value.trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function combineDateTime(dateValue: string, timeValue: string): string | null {
  const date = parseSheetDateOnly(dateValue)
  const time = parseSheetTime(timeValue)
  if (!date || !time) return null
  return isoJakartaDateTime(date.day, date.month, date.year, time.hour, time.minute)
}

export type SheetScheduleRow = {
  id: string
  judul: string
  jenis: string
  mulai: string
  selesai: string
  lokasi: string | null
  penyelenggara: string | null
  peserta: string | null
  deskripsi: string | null
  link_form: string | null
  google_calendar_event_id: string | null
  google_calendar_link: string | null
  google_sheet_synced_at: string | null
  status: string
  dibuat_oleh: string | null
  created_at: string
  updated_at: string | null
}

export async function fetchScheduleRowsFromSheet(): Promise<{ rows: SheetScheduleRow[]; error: string | null }> {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) return { rows: [], error: 'GOOGLE_SHEET_ID belum dikonfigurasi' }
  const token = await getAccessToken([SHEETS_READONLY_SCOPE])
  if (!token) return { rows: [], error: 'Service account Google belum valid atau belum dikonfigurasi' }

  const range = encodeURIComponent(process.env.GOOGLE_SHEET_JADWAL_RANGE || 'A:N')
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 60 },
  })
  if (!res.ok) {
    const detail = await res.text()
    return { rows: [], error: `Gagal membaca Spreadsheet (${res.status}): ${detail.slice(0, 160)}` }
  }

  const json = await res.json() as { values?: string[][] }
  const values = json.values ?? []
  if (values.length <= 1) return { rows: [], error: null }

  const rows = values.slice(1).map((row, index): SheetScheduleRow | null => {
    const header = values[0] ?? []
    const multiDayFormat = cell(header, 3).toLowerCase() === 'tanggal mulai'
    const splitTimeFormat = cell(header, 3).toLowerCase() === 'tanggal'
    const mulai = multiDayFormat
      ? combineDateTime(cell(row, 3), cell(row, 4))
      : splitTimeFormat
        ? combineDateTime(cell(row, 3), cell(row, 4))
        : parseSheetDate(cell(row, 3))
    const selesai = multiDayFormat
      ? combineDateTime(cell(row, 5) || cell(row, 3), cell(row, 6))
      : splitTimeFormat
        ? combineDateTime(cell(row, 3), cell(row, 5))
        : parseSheetDate(cell(row, 4)) ?? mulai
    if (!cell(row, 1) || !mulai || !selesai) return null
    const id = cell(row, 0) || `sheet-${index + 2}`
    const statusIndex = multiDayFormat ? 11 : splitTimeFormat ? 10 : 9
    const status = cell(row, statusIndex) || 'Terjadwal'
    return {
      id,
      judul: cell(row, 1),
      jenis: cell(row, 2) || 'Kegiatan',
      mulai,
      selesai,
      lokasi: cell(row, multiDayFormat ? 7 : splitTimeFormat ? 6 : 5) || null,
      penyelenggara: cell(row, multiDayFormat ? 8 : splitTimeFormat ? 7 : 6) || null,
      peserta: cell(row, multiDayFormat ? 9 : splitTimeFormat ? 8 : 7) || null,
      deskripsi: cell(row, multiDayFormat ? 10 : splitTimeFormat ? 9 : 8) || null,
      link_form: googleIntegrationStatus().formUrl,
      google_calendar_event_id: cell(row, multiDayFormat ? 12 : splitTimeFormat ? 11 : 10) || null,
      google_calendar_link: cell(row, multiDayFormat ? 13 : splitTimeFormat ? 12 : 11) || null,
      google_sheet_synced_at: new Date().toISOString(),
      status,
      dibuat_oleh: null,
      created_at: mulai,
      updated_at: null,
    }
  }).filter((row): row is SheetScheduleRow => row !== null)

  return { rows, error: null }
}

export async function createCalendarEvent(payload: JadwalGooglePayload): Promise<{ id: string; htmlLink: string } | null> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) return null
  const token = await getAccessToken([CALENDAR_SCOPE])
  if (!token) return null

  const description = [
    payload.deskripsi,
    payload.peserta ? `Peserta: ${payload.peserta}` : null,
    payload.linkForm ? `Form: ${payload.linkForm}` : null,
  ].filter(Boolean).join('\n\n')

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: payload.judul,
      location: payload.lokasi ?? undefined,
      description,
      start: { dateTime: payload.mulai, timeZone: 'Asia/Jakarta' },
      end: { dateTime: payload.selesai, timeZone: 'Asia/Jakarta' },
      extendedProperties: {
        private: {
          jenis: payload.jenis,
          penyelenggara: payload.penyelenggara ?? '',
        },
      },
    }),
  })
  if (!res.ok) return null
  const json = await res.json() as { id?: string; htmlLink?: string }
  return json.id && json.htmlLink ? { id: json.id, htmlLink: json.htmlLink } : null
}

export async function appendScheduleRow(payload: JadwalGooglePayload, localId: string): Promise<boolean> {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) return false
  const token = await getAccessToken([SHEETS_SCOPE])
  if (!token) return false
  const range = encodeURIComponent(process.env.GOOGLE_SHEET_JADWAL_RANGE || 'A:N')
  const start = new Date(payload.mulai)
  const end = new Date(payload.selesai)
  const startDate = start.toLocaleDateString('id-ID')
  const startTime = start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  const endDate = end.toLocaleDateString('id-ID')
  const endTime = end.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [[
        localId,
        payload.judul,
        payload.jenis,
        startDate,
        startTime,
        endDate,
        endTime,
        payload.lokasi ?? '',
        payload.penyelenggara ?? '',
        payload.peserta ?? '',
        payload.deskripsi ?? '',
        'Terjadwal',
        '',
        '',
      ]],
    }),
  })
  return res.ok
}
