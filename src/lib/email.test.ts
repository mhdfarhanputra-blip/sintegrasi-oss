import { describe, it, expect } from 'vitest'
import { buildNotificationEmailHtml } from './email'

describe('buildNotificationEmailHtml', () => {
  it('mengandung judul yang diberikan', () => {
    const html = buildNotificationEmailHtml({ title: 'Permohonan Baru' })
    expect(html).toContain('Permohonan Baru')
  })

  it('meng-escape input judul sehingga tidak ada <script> mentah', () => {
    const html = buildNotificationEmailHtml({ title: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('menyertakan pesan opsional saat diberikan', () => {
    const html = buildNotificationEmailHtml({ title: 'Judul', message: 'Isi pesan notifikasi' })
    expect(html).toContain('Isi pesan notifikasi')
  })
})
