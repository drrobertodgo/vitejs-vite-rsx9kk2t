import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { callGemini } from './api/_gemini-core.js'

// Plugin de desarrollo: reproduce el endpoint /api/gemini de Vercel cuando
// se corre `npm run dev`, para que todo funcione localmente igual que en
// producción. En producción este código NO se usa (lo sirve Vercel).
function geminiDevApi(env) {
  return {
    name: 'gemini-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Método no permitido. Usa POST.' }))
          return
        }

        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')

          const { promptBody, systemInstruction, jsonSchemaInput = null } = body

          const text = await callGemini({
            apiKey: env.GEMINI_API_KEY,
            promptBody,
            systemInstruction,
            jsonSchemaInput,
          })

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ text }))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err?.message || String(err) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Carga variables de entorno (incluye las que NO empiezan por VITE_).
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), geminiDevApi(env)],
  }
})
