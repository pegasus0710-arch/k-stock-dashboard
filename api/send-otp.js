export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  const { email, uid } = req.body
  if (!email || !uid) return res.status(400).json({ error: 'email and uid required' })

  const otp     = Math.floor(100000 + Math.random() * 900000).toString()
  const expires = Date.now() + 10 * 60 * 1000

  try {
    /* Firestore REST API로 OTP 저장 */
    const projectId = 'k-stock-dashboard'
    const dbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/otps/${uid}`

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

    if (!firestoreRes.ok) {
      const errText = await firestoreRes.text()
      throw new Error(`Firestore error: ${errText}`)
    }

    /* Resend API로 이메일 발송 */
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'K-Stock Dashboard <onboarding@resend.dev>',
        to: [email],
        subject: '[K-Stock] 새 기기 로그인 인증 코드',
        html: `
          <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 420px; margin: 0 auto; padding: 20px;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:24px;">
              <div style="width:44px;height:44px;background:#2563eb;border-radius:10px;display:flex;align-items:center;justify-content:center;">
                <span style="color:#fff;font-size:22px;font-weight:800;">K</span>
              </div>
              <div>
                <div style="font-size:16px;font-weight:800;color:#1a202c;">K-Stock Dashboard</div>
                <div style="font-size:12px;color:#64748b;">한국 주식 테마별 통합 분석 플랫폼</div>
              </div>
            </div>
            <p style="color:#374151;font-size:14px;">새로운 기기에서 로그인 요청이 감지됐습니다.</p>
            <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;text-align:center;margin:20px 0;">
              <p style="color:#64748b;font-size:13px;margin:0 0 10px;">인증 코드</p>
              <div style="font-size:42px;font-weight:800;color:#2563eb;letter-spacing:10px;">${otp}</div>
              <p style="color:#94a3b8;font-size:12px;margin:10px 0 0;">10분 이내에 입력해주세요</p>
            </div>
            <p style="color:#a0aec0;font-size:12px;">본인이 아닌 경우 이 이메일을 무시하세요.</p>
          </div>
        `
      })
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      throw new Error(`Resend error: ${errText}`)
    }

    res.status(200).json({ success: true })
  } catch (e) {
    console.error('OTP error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
