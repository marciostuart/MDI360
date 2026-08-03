import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/queue/pair-emitter')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { pairEmitter } = await import('@/lib/queue/emitter.functions')
          
          const result = await pairEmitter({ data: { code: body.code } })
          return Response.json(result)
        } catch (error) {
          console.error('[pair-emitter] erro:', error)
          return new Response(error instanceof Error ? error.message : 'Código inválido', { status: 400 })
        }
      }
    }
  }
})
