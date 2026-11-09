import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireActiveUser } from '@/lib/apiAuth'
import { internalApiError } from '@/lib/apiError'
import {
  parseKontraktualWorkbook,
  parsePaketWorkbook,
  parseRkaklWorkbook,
  type IemonDataset,
} from '@/lib/iemonParser'
import { enhanceIemonDatasetWithAi } from '@/lib/iemonAi'
import { getIemonDataset, saveIemonDataset } from '@/lib/iemonStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_FILE_SIZE = 15 * 1024 * 1024

function isXlsx(file: File): boolean {
  return file.name.toLowerCase().endsWith('.xlsx') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

async function readDatasetPart(file: File): Promise<ArrayBuffer> {
  if (file.size > MAX_FILE_SIZE) throw new Error(`Ukuran file ${file.name} melebihi 15 MB`)
  if (!isXlsx(file)) throw new Error(`File ${file.name} harus berformat .xlsx`)
  return file.arrayBuffer()
}

async function parseWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

export async function POST(request: Request) {
  try {
    const auth = await requireActiveUser()
    if ('response' in auth) return auth.response
    if (auth.me.role !== 'Admin') {
      return NextResponse.json({ error: 'Hanya Admin aktif yang dapat mengupload data i-EMON' }, { status: 403 })
    }

    const formData = await request.formData()
    const paketFile = formData.get('paket') as File | null
    const kontraktualFile = formData.get('kontraktual') as File | null
    const rkaklFile = formData.get('rkakl') as File | null

    if (!paketFile && !kontraktualFile && !rkaklFile) {
      return NextResponse.json({ error: 'Minimal satu file Excel harus diunggah' }, { status: 400 })
    }

    const existing = await getIemonDataset()
    const working: IemonDataset = {
      ...existing.data,
      sourceFiles: {
        paket: paketFile?.name ?? existing.data.sourceFiles.paket,
        kontraktual: kontraktualFile?.name ?? existing.data.sourceFiles.kontraktual,
        rkakl: rkaklFile?.name ?? existing.data.sourceFiles.rkakl,
      },
    }

    if (paketFile) {
      const workbook = await parseWorkbook(await readDatasetPart(paketFile))
      working.paket = parsePaketWorkbook(workbook)
    }
    if (kontraktualFile) {
      const workbook = await parseWorkbook(await readDatasetPart(kontraktualFile))
      working.kontraktual = parseKontraktualWorkbook(workbook)
    }
    if (rkaklFile) {
      const workbook = await parseWorkbook(await readDatasetPart(rkaklFile))
      working.rkakl = parseRkaklWorkbook(workbook)
    }

    if (!working.paket.length && !working.kontraktual.length && !working.rkakl.length) {
      return NextResponse.json({ error: 'Tidak ditemukan data yang valid pada file yang diunggah' }, { status: 400 })
    }

    const enhanced = await enhanceIemonDatasetWithAi(working)
    await saveIemonDataset(enhanced)

    return NextResponse.json({
      success: true,
      message: 'Data i-EMON berhasil diproses dan disimpan',
      summary: {
        paket: enhanced.paket.length,
        kontraktual: enhanced.kontraktual.length,
        rkakl: enhanced.rkakl.length,
        sourceFiles: enhanced.sourceFiles,
      },
    })
  } catch (err) {
    return internalApiError('IEMON Upload POST', err)
  }
}
