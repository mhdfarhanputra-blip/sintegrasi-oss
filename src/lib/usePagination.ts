import { useMemo, useState } from 'react'
import { ITEMS_PER_PAGE } from './constants'

/**
 * Hook pagination client-side reusable.
 * Otomatis reset ke halaman 1 ketika halaman aktif melebihi total halaman
 * (misal setelah filter diterapkan).
 */
export function usePagination<T>(items: T[], perPage = ITEMS_PER_PAGE) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(items.length / perPage))
  const safePage = Math.min(currentPage, totalPages)

  const paginated = useMemo(
    () => items.slice((safePage - 1) * perPage, safePage * perPage),
    [items, safePage, perPage],
  )

  return { paginated, currentPage: safePage, totalPages, setCurrentPage }
}
