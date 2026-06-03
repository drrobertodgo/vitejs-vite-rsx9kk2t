// =========================================================================
// LÓGICA COMPARTIDA PARA LLAMAR A GEMINI
// -------------------------------------------------------------------------
// Este archivo NO es una ruta (empieza con "_", así que Vercel lo ignora
// como endpoint). Lo importan tanto la función serverless de producción
// (api/gemini.js) como el middleware de desarrollo de Vite (vite.config.js).
//
// Es EXACTAMENTE la misma lógica que antes vivía dentro de runGeminiCall
// en el navegador: mismos modelos, mismo payload, mismos reintentos. La
// única diferencia es que ahora corre en el servidor y la API Key viene
// de una variable de entorno en vez de estar escrita en el código.
// =========================================================================

const MODELS_TO_TRY = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const buildPayload = (promptBody, systemInstruction, jsonSchemaInput) => {
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: promptBody }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
  };

  if (jsonSchemaInput) {
    let finalSchema = null;

    if (jsonSchemaInput === true) {
      finalSchema = {
        type: 'OBJECT',
        properties: {
          message: {
            type: 'STRING',
            description: 'Mensaje pedagógico para el evaluador.',
          },
          nivel: {
            type: 'STRING',
            enum: ['Autónomo', 'Destacado', 'En desarrollo', 'Requiere apoyo'],
            description: 'Nivel seleccionado o recalculado.',
          },
          puntos: {
            type: 'INTEGER',
            description: 'Puntos recomendados en este criterio.',
          },
        },
        required: ['message', 'nivel', 'puntos'],
      };
    } else {
      finalSchema = jsonSchemaInput;
    }

    payload.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: finalSchema,
    };
  } else {
    payload.generationConfig = {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1200,
    };
  }

  return payload;
};

/**
 * Llama a Gemini probando los modelos en orden y reintentando hasta 3 veces
 * por modelo con backoff exponencial. Devuelve el texto de la respuesta.
 *
 * @param {object} params
 * @param {string} params.apiKey            API Key de Gemini (desde el servidor).
 * @param {string} params.promptBody        Prompt del usuario.
 * @param {string} params.systemInstruction Instrucción de sistema.
 * @param {boolean|object|null} params.jsonSchemaInput  true = schema por defecto,
 *                                           objeto = schema personalizado, null = texto libre.
 * @returns {Promise<string>}
 */
export async function callGemini({
  apiKey,
  promptBody,
  systemInstruction,
  jsonSchemaInput = null,
}) {
  if (!apiKey) {
    throw new Error(
      'API_KEY_INVALID: No hay API Key de Gemini configurada en el servidor (variable de entorno GEMINI_API_KEY).'
    );
  }

  const payload = buildPayload(promptBody, systemInstruction, jsonSchemaInput);

  let lastError = null;

  for (const model of MODELS_TO_TRY) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    let delay = 1000;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        const text = data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || '')
          ?.join('')
          ?.trim();

        if (!text) {
          throw new Error('Gemini respondió, pero no devolvió texto útil.');
        }

        return text;
      } catch (err) {
        lastError = err;

        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }
  }

  throw lastError || new Error('No fue posible obtener respuesta de Gemini.');
}
