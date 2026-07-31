import { z } from 'zod'

/**
 * Example Zod schema demonstrating the Zod-on-handler validation pattern.
 * Usage at the handler boundary:
 *   const result = exampleSchema.safeParse(await request.json())
 *   if (!result.success) {
 *     return Response.json({ error: 'validation_failed', issues: result.error.issues }, { status: 422 })
 *   }
 *   // result.data is typed and safe to pass to the service layer
 */
export const exampleSchema = z.object({
  ping: z.boolean(),
})

export type ExampleInput = z.infer<typeof exampleSchema>
