const formatterGTQ = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
})

const formatterUSD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatGTQ(monto: number): string {
  return formatterGTQ.format(monto)
}

export function formatUSD(monto: number): string {
  return formatterUSD.format(monto)
}
