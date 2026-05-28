declare module '@/lib/supabase/middleware' {
  import type { NextRequest, NextResponse } from 'next/server'
  export function updateSession(request: NextRequest | Request): Promise<NextResponse | void>
}
