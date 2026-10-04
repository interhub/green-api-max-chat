export type PhoneResult = { ok: true; digits: string } | { ok: false; error: string }

const PHONE_ERROR = 'Введите номер России (+7) или Беларуси (+375).'

/** Turns a number typed by a person into the digits checkAccount expects: RU 7XXXXXXXXXX or BY 375XXXXXXXXX. */
export function normalizePhone(input: string): PhoneResult {
  let digits = input.replace(/\D/g, '')
  // Belarus writes its numbers as 8 0XX XXX-XX-XX inside the country; Russian codes never start with 0.
  if (digits.length === 11 && digits.startsWith('80')) digits = `375${digits.slice(2)}`
  else if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  else if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`
  const russian = digits.length === 11 && digits.startsWith('7')
  const belarusian = digits.length === 12 && digits.startsWith('375')
  return russian || belarusian ? { ok: true, digits } : { ok: false, error: PHONE_ERROR }
}

/** "+7 900 123-45-67" for Russia, "+375 29 123-45-67" for Belarus, "+<digits>" for anything else. */
export function formatPhone(digits: string): string {
  const russian = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits)
  if (russian) return `+7 ${russian[1]} ${russian[2]}-${russian[3]}-${russian[4]}`
  const belarusian = /^375(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(digits)
  if (belarusian) return `+375 ${belarusian[1]} ${belarusian[2]}-${belarusian[3]}-${belarusian[4]}`
  return `+${digits}`
}
