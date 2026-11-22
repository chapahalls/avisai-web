/** Sem URL, mantém a demo local. Uma API configurada nunca falha silenciosamente para mock. */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
