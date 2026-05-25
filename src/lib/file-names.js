export const DEFAULT_DOWNLOAD_FILENAME = 'grammar.y';
export const DEFAULT_REPORT_FILENAME = 'lrama-report.html';

export function sanitizeDownloadFileName(fileName, fallback = DEFAULT_DOWNLOAD_FILENAME) {
  const sanitized = String(fileName || '').trim().replace(/[\\/:*?"<>|]+/g, '-');
  return sanitized || fallback;
}

export function reportFileNameForGrammar(fileName) {
  const cleanName = sanitizeDownloadFileName(fileName, DEFAULT_DOWNLOAD_FILENAME);
  const stem = cleanName.replace(/\.(y|yacc|yy)$/i, '') || 'grammar';
  return `${stem}-report.html`;
}
