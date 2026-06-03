// =========================================================================
// FUNCIÓN SERVERLESS DE VERCEL: POST /api/gemini
// -------------------------------------------------------------------------
// Recibe { promptBody, systemInstruction, jsonSchemaInput } desde el
// navegador, llama a Gemini con la API Key guardada en el servidor
// (variable de entorno GEMINI_API_KEY) y devuelve { text }.
//
// La API Key NUNCA llega al navegador.
// =========================================================================

import { callGemini } from './_gemini-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  try {
    // En Vercel, req.body ya viene parseado si el Content-Type es JSON.
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    const { promptBody, systemInstruction, jsonSchemaInput = null } = body;

    if (!promptBody || !systemInstruction) {
      return res
        .status(400)
        .json({ error: 'Faltan promptBody o systemInstruction en la petición.' });
    }

    const text = await callGemini({
      apiKey: process.env.GEMINI_API_KEY,
      promptBody,
      systemInstruction,
      jsonSchemaInput,
    });

    return res.status(200).json({ text });
  } catch (err) {
    // Reenviamos el mensaje de error tal cual para que el frontend pueda
    // seguir clasificándolo (API_KEY_INVALID, 403, 429, etc.).
    const message = err?.message || String(err);
    return res.status(500).json({ error: message });
  }
}
