export function toLocale(timestamp: number | string): string {
  return new Date(timestamp).toLocaleDateString("ru-RU");
}


 export function toUsdt(val: number | null) {
    return val?.toFixed(2) || 0;
}
  

export function getSlicedString(text = ""): string {
  return text.slice(0, 3) + "*" + text.slice(-2);
}
