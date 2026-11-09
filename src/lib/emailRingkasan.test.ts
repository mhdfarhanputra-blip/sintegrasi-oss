import { describe, it, expect } from 'vitest'
import { buildRingkasanEmailHtml } from './email'

describe('buildRingkasanEmailHtml', () => {
  it('menampilkan judul, pengantar, dan seluruh butir', () => {
    const html = buildRingkasanEmailHtml({
      title: 'SLA pemeriksaan terlampaui (2 permohonan)',
      intro: 'Perlu segera ditindaklanjuti.',
      link: '/utilitas',
      items: [
        { title: 'Pemasangan PJU', message: 'PT Contoh • terlambat 3 hari' },
        { title: 'Relokasi tiang', message: null },
      ],
    })
    expect(html).toContain('SLA pemeriksaan terlampaui')
    expect(html).toContain('Perlu segera ditindaklanjuti.')
    expect(html).toContain('Pemasangan PJU')
    expect(html).toContain('terlambat 3 hari')
    expect(html).toContain('Relokasi tiang')
    expect(html).toContain('/utilitas')
  })

  it('meng-escape isi butir agar tidak ada HTML mentah', () => {
    const html = buildRingkasanEmailHtml({
      title: 'Judul',
      items: [{ title: '<b>Nama</b>', message: '<img src=x onerror=alert(1)>' }],
    })
    expect(html).not.toContain('<b>Nama</b>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;b&gt;Nama&lt;/b&gt;')
  })

  it('tetap menghasilkan HTML valid walau daftar butir kosong', () => {
    const html = buildRingkasanEmailHtml({ title: 'Kosong', items: [] })
    expect(html).toContain('Kosong')
    expect(html).toContain('</html>')
  })
})
