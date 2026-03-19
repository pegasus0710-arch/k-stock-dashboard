export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { code, freq = 'd' } = req.query
  if (!code) return res.status(400).json({ error: 'code required' })

  const end   = new Date()
  const start = new Date()
  if (freq === 'd') start.setFullYear(start.getFullYear() - 1)
  else if (freq === 'w') start.setFullYear(start.getFullYear() - 3)
  else start.setFullYear(start.getFullYear() - 5)

  const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'')
  const url = `https://stooq.com/q/d/l/?s=${code}.kr&d1=${fmt(start)}&d2=${fmt(end)}&i=${freq}`

  try {
    const r    = await fetch(url)
    const text = await r.text()

    if (!text || text.includes('No data') || text.trim().length < 50) {
      return res.status(404).json({ error: 'no data' })
    }

    const lines   = text.trim().split('\n').slice(1)
    const candles = []

    lines.forEach(line => {
      const [date, open, high, low, close, volume] = line.split(',')
      if (!date || !close || close.trim() === 'null' || isNaN(parseFloat(close))) return
      candles.push({
        time:   Math.floor(new Date(date).getTime() / 1000),
        open:   parseFloat(open),
        high:   parseFloat(high),
        low:    parseFloat(low),
        close:  parseFloat(close),
        volume: parseInt(volume) || 0,
      })
    })

    if (candles.length === 0) return res.status(404).json({ error: 'no candles' })

    const last = candles[candles.length - 1]
    const prev = candles[candles.length - 2]

    res.status(200).json({
      candles,
      currentPrice: last.close,
      prevClose:    prev?.close || last.close,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
