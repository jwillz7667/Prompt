import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  PROMPTOMIZE_PUBLIC_API_BASE_URL: z.url(),
  PROMPTOMIZE_CHATGPT_API_KEY: z.string().min(1),
  CHATGPT_APP_BASE_URL: z.url(),
  CHATGPT_WIDGET_DOMAIN: z.url(),
})

export type AppEnv = z.infer<typeof envSchema>

export function readEnv(): AppEnv {
  return envSchema.parse({
    PORT: process.env['PORT'],
    PROMPTOMIZE_PUBLIC_API_BASE_URL: process.env['PROMPTOMIZE_PUBLIC_API_BASE_URL'],
    PROMPTOMIZE_CHATGPT_API_KEY: process.env['PROMPTOMIZE_CHATGPT_API_KEY'],
    CHATGPT_APP_BASE_URL: process.env['CHATGPT_APP_BASE_URL'],
    CHATGPT_WIDGET_DOMAIN: process.env['CHATGPT_WIDGET_DOMAIN'],
  })
}
