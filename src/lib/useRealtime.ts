'use client'

import { useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

/**
 * Subscribe ke perubahan realtime pada sebuah tabel Supabase.
 * Memanggil router.refresh() untuk re-fetch server data DAN
 * optional onUpdate callback untuk update local state langsung.
 */
export function useRealtime(table: string, onUpdate?: () => void) {
  const router = useRouter()

  const handleChange = useCallback(() => {
    router.refresh()
    onUpdate?.()
  }, [router, onUpdate])

  useEffect(() => {
    const supabase = createClient()
    const channelName = `realtime-${table}-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table }, handleChange)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, handleChange])
}
