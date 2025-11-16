export function getDates(dayLength: number, dayStartBefore = 0): { start: number; to: number } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const dayMs = 24 * 60 * 60 * 1000;
  const daysBack = dayStartBefore * dayMs;
  const to = new Date(year, month, day).getTime() - new Date().getTimezoneOffset() * 60 * 1000 - daysBack;
  const start = to - dayLength * dayMs;
  return { start, to };
}

// Определение типа для строки в формате "DD.MM.YYYY"
type DateString = `${number}.${number}.${number}`;

export function parseDate(dateString: DateString): number {
  // Парсинг даты в формате "DD.MM.YYYY"
  const [day, month, year] = dateString.split('.').map(Number);
  
  // Создание объекта Date (месяцы в JS начинаются с 0)
  const date = new Date(year, month - 1, day);
  
  // Получение времени с учетом часового пояса
  return date.getTime() - date.getTimezoneOffset() * 60 * 1000;
}
