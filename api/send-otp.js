export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  const { email, uid } = req.body
  if (!email || !uid) return res.status(400).json({ error: 'email and uid required' })

  /* 6자리 OTP 생성 */
  const otp     = Math.floor(100000 + Math.random() * 900000).toString()
  const expires = Date.now() + 10 * 60 * 1000  // 10분

  /* Firestore에 OTP 저장 (Firebase Admin 대신 REST API 사용) */
  const projectId = process.env.FIREBASE_PROJECT_ID || 'k-stock-dashboard'
  const dbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/otp/current`

  /* Firebase Admin SDK 없이 REST로 Firestore 쓰기 */
  try {
    const firestoreRes = await fetch(dbUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          otp:     { stringValue: otp },
          expires: { integerValue: expires.toString() },
          email:   { stringValue: email },
        }
      })
    })

    if (!firestoreRes.ok) throw new Error('Firestore write failed')

    /* 이메일 발송 — Gmail SMTP via nodemailer */
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      }
    })

    await transporter.sendMail({
      from: `"K-Stock Dashboard" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: '[K-Stock] 새 기기 로그인 인증 코드',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
          <h2 style="color: #2563eb;">K-Stock Dashboard</h2>
          <p>새로운 기기에서 로그인 요청이 감지됐습니다.</p>
          <div style="background: #f4f6f9; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">인증 코드</p>
            <h1 style="color: #1a202c; font-size: 40px; letter-spacing: 8px; margin: 0;">${otp}</h1>
            <p style="color: #64748b; font-size: 12px; margin: 8px 0 0;">10분 이내에 입력해주세요</p>
          </div>
          <p style="color: #a0aec0; font-size: 12px;">본인이 아닌 경우 이 이메일을 무시하세요.</p>
        </div>
      `
    })

    res.status(200).json({ success: true })
  } catch (e) {
    console.error('OTP send error:', e)
    res.status(500).json({ error: e.message })
  }
}
