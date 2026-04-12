const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const resend = new Resend('re_VsFbRPZW_JY4wDyEWPm698t6nyWY7CKtp');

// 存储验证码（生产环境用 Redis）
const codes = {};

// 发送验证码
app.post('/send-code', async (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: '无效的邮箱地址' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes[email] = { code, expires: Date.now() + 5 * 60 * 1000 };

  try {
    await resend.emails.send({
      from: 'Mini Brother <noreply@resend.dev>',
      to: email,
      subject: '【迷你兄弟】您的验证码',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #6366f1;">迷你兄弟</h2>
          <p>您好！</p>
          <p>您的注册验证码是：</p>
          <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; border-radius: 8px; margin: 20px 0;">
            <strong>${code}</strong>
          </div>
          <p>验证码有效期为 5 分钟，请勿告诉他人。</p>
          <p style="color: #6b7280; font-size: 12px;">— 迷你兄弟团队</p>
        </div>
      `
    });

    res.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    console.error('发送失败:', error.message);
    // 演示模式：也返回验证码到控制台
    console.log(`【演示】验证码 ${code} 已发送到 ${email}`);
    res.json({ success: true, message: '验证码已发送（演示模式）', code });
  }
});

// 验证验证码
app.post('/verify-code', (req, res) => {
  const { email, code } = req.body;
  
  const record = codes[email];
  if (!record) {
    return res.status(400).json({ error: '请先获取验证码' });
  }
  
  if (Date.now() > record.expires) {
    delete codes[email];
    return res.status(400).json({ error: '验证码已过期' });
  }
  
  if (record.code !== code) {
    return res.status(400).json({ error: '验证码错误' });
  }
  
  delete codes[email];
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mail API running on port ${PORT}`);
});
