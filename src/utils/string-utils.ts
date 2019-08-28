export function formatString(text: string, ...args: any[]): string {
  let formatted = text;
  for (let i = 0; i < args.length; i++) {
    const regexp = new RegExp('\\{' + i + '\\}', 'gi');
    formatted = formatted.replace(regexp, args[i]);
  }
  return formatted;
}

export function cleanString(str: string): string {
  return str.replace(/[^A-Za-z0-9: \-_,]/g, '');
}

export function cleanChatString(str) {
  return str
    .replace('ä', 'a')
    .replace('ö', 'o')
    .replace(/[^A-Za-z0-9:<>.?! \-_,]/g, '');
}
