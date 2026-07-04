export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  // Non-Latin names (Hebrew, Arabic, etc.) strip to empty — fall back to a random id
  if (!base) {
    return 'creator-' + Math.random().toString(36).slice(2, 8)
  }
  return base
}

export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (amount < 0 ? '-' : '') + 'HC ' + formatted
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}
