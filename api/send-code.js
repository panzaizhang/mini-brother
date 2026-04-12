const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_VsFbRPZW_JY4wDyEWPm698t6nyWY7CKtp';

const HTML_TEMPLATE = (code) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; background: #0a0a1a; margin:0; padding:40px 20px;">
  <div style="max-width:480px; margin:0 auto; background:#12122a; border-radius:16px; padding:40px; text-align:center;">
    <h1 style="color:#818cf8; font-size:28px; margin:0 0 30px;">迷你兄弟</h1>
    <div style="background:#1a1a3a; border-radius:12px; padding:30px; margin:20px 0;">
      <p style="color:#94a3b8; font-size:16px; margin:0 0 20px;">您的注册验证码</p>
      <div style="font-size:42px; font-weight:700; color:#818cf8; letter-spacing:12px;">${code}</div>
    </div>
    <p style="color:#64748b; font-size:13px;">验证码 5 分钟内有效</p>
  </div>
</body>
</html>
`;

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Invalid email' });
    }

    const code = Math.random().toString().substring(2, 8);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Mini Brother <noreply@resend.dev>',
        to: email,
        subject: '【迷你兄弟】您的注册验证码',
        html: HTML_TEMPLATE(code)
      })
    });

    if (response.ok) {
      return res.status(200).json({ success: true, code });
    } else {
      const err = await response.json();
      return res.status(400).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
