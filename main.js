/**
 * 迷你兄弟 - 核心JS逻辑 (SaaS后台风格)
 * MB namespace
 */

// Firebase 初始化（SDK已在HTML中静态引入）
document.addEventListener('DOMContentLoaded', function() {
  if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined') {
    initFirebaseAuth();
  }
});

function initFirebaseAuth() {
  // 初始化 Firebase
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  MB.auth = firebase.auth();
  
  // 初始化 Firestore（可选，如果不可用则设为 null）
  try {
    MB.db = firebase.firestore();
  } catch (e) {
    console.warn('Firestore 不可用:', e);
    MB.db = null;
  }

  // 监听登录状态变化
  MB.auth.onAuthStateChanged(async function(user) {
    if (user) {
      // 用户已登录，保存基本信息
      localStorage.setItem('mb_uid', user.uid);
      localStorage.setItem('mb_email', user.email);
      MB._currentUser = { uid: user.uid, email: user.email };
      
      // 如果 Firestore 可用，尝试获取完整用户数据
      if (MB.db) {
        try {
          const doc = await MB.db.collection('users').doc(user.uid).get();
          if (doc.exists) {
            const userData = doc.data();
            MB._currentUser = { ...userData, uid: user.uid, email: user.email };
            MB._userRef = MB.db.collection('users').doc(user.uid);
          }
        } catch (err) {
          console.error('获取用户数据失败:', err);
        }
      }
    } else {
      // 用户未登录
      localStorage.removeItem('mb_uid');
      localStorage.removeItem('mb_email');
      MB._currentUser = null;
      MB._userRef = null;
    }
  });
}

const MB = {
  // Firebase 引用（初始化后赋值）
  auth: null,
  db: null,
  _currentUser: null,
  _userRef: null,

  // ===== 工具函数 =====
  hashPassword(pwd) {
    let hash = 2166136261;
    for (let i = 0; i < pwd.length; i++) {
      hash ^= pwd.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  },

  toast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    toast.innerHTML = `<div class="toast-icon">${icons[type] || icons.info}</div><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // ===== 用户系统（兼容旧localStorage + Firebase）=====
  _localUsers: JSON.parse(localStorage.getItem('mb_users') || '{}'),

  getUsers() {
    return this._localUsers;
  },

  saveUsers() {
    localStorage.setItem('mb_users', JSON.stringify(this._localUsers));
  },

  // 获取当前用户（优先Firebase，否则localStorage）
  getCurrentUser() {
    if (this._currentUser) {
      return this._currentUser;
    }
    const email = localStorage.getItem('mb_email') || localStorage.getItem('mb_current');
    if (!email) return null;
    return this._localUsers[email] || { email };
  },

  isLoggedIn() {
    return !!localStorage.getItem('mb_email') || !!localStorage.getItem('mb_current') || (this.auth && this.auth.currentUser);
  },

  requireLogin() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  },

  // Firebase 登录
  async handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      this.toast('请填写邮箱和密码', 'error');
      return;
    }

    // 如果 Firebase 不可用，使用本地登录
    if (!this.auth) {
      this.toast('系统初始化中，请稍候...', 'info');
      setTimeout(() => this.handleLogin(null), 1000);
      return;
    }

    try {
      const result = await this.auth.signInWithEmailAndPassword(email, password);
      this.toast('登录成功！', 'success');

      // 保存登录信息
      localStorage.setItem('mb_email', email);
      localStorage.setItem('mb_uid', result.user.uid);

      // 如果是新用户，在 Firestore 创建用户文档
      if (this.db) {
        const userRef = this.db.collection('users').doc(result.user.uid);
        const doc = await userRef.get();
        if (!doc.exists) {
          await userRef.set({
            email: email,
            name: email.split('@')[0],
            balance: 0,
            withdrawable: 0,
            totalCommission: 0,
            invitedCount: 0,
            inviteCode: 'MB' + email.substring(0, 6).toUpperCase(),
            orders: [],
            subscription: null,
            traffic: { used: 0, total: '100GB' },
            createdAt: new Date().toISOString().split('T')[0]
          });
        }
      }

      setTimeout(() => window.location.href = 'dashboard.html', 800);
    } catch (err) {
      console.error('登录失败:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        this.toast('邮箱或密码错误', 'error');
      } else if (err.code === 'auth/too-many-requests') {
        this.toast('登录尝试次数过多，请稍后再试', 'error');
      } else {
        this.toast('登录失败: ' + err.message, 'error');
      }
    }
  },

  // Firebase 注册
  async handleRegister(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('regEmail').value.trim();
    const code = document.getElementById('regCode').value.trim();
    const password = document.getElementById('regPassword').value;
    const password2 = document.getElementById('regPassword2').value;
    const agree = document.getElementById('agreeTerms').checked;

    if (!email || !code || !password || !password2) {
      this.toast('请填写所有字段', 'error');
      return;
    }
    if (!email.includes('@')) {
      this.toast('请输入有效的邮箱', 'error');
      return;
    }
    if (password.length < 8) {
      this.toast('密码至少8位', 'error');
      return;
    }
    if (password !== password2) {
      this.toast('两次密码不一致', 'error');
      return;
    }
    if (!agree) {
      this.toast('请同意服务条款', 'error');
      return;
    }

    // 验证验证码
    const storedStr = localStorage.getItem('mb_verify_' + email);
    if (!storedStr) {
      this.toast('请先获取验证码', 'error');
      return;
    }
    try {
      const stored = JSON.parse(storedStr);
      if (stored.code !== code) {
        this.toast('验证码错误', 'error');
        return;
      }
      if (Date.now() > stored.expires) {
        this.toast('验证码已过期，请重新获取', 'error');
        return;
      }
    } catch (e) {
      this.toast('验证码验证失败', 'error');
      return;
    }

    // 如果 Firebase 不可用，使用本地注册
    if (!this.auth) {
      this.toast('Firebase 未连接，请稍后重试', 'error');
      return;
    }

    // 清理 localStorage 中的旧验证记录
    localStorage.removeItem('mb_verify_' + email);
    localStorage.removeItem('mb_users');
    localStorage.removeItem('mb_current');

    // 检查 Firebase 是否已有该账号
    try {
      const providers = await this.auth.fetchSignInMethodsForEmail(email);
      if (providers.length > 0) {
        this.toast('该邮箱已注册，请直接登录', 'error');
        return;
      }
    } catch (err) {
      // 如果不是 "email not found" 错误，继续注册
      if (err.code !== 'auth/user-not-found') {
        console.error('检查账号失败:', err);
      }
    }

    // 注册新账号
    try {
      const result = await this.auth.createUserWithEmailAndPassword(email, password);

      // 保存登录信息
      localStorage.setItem('mb_email', email);
      localStorage.setItem('mb_uid', result.user.uid);

      // 在 Firestore 创建用户文档
      if (this.db) {
        await this.db.collection('users').doc(result.user.uid).set({
          email: email,
          name: email.split('@')[0],
          balance: 0,
          withdrawable: 0,
          totalCommission: 0,
          invitedCount: 0,
          inviteCode: 'MB' + email.substring(0, 6).toUpperCase(),
          orders: [],
          subscription: null,
          traffic: { used: 0, total: '100GB' },
          createdAt: new Date().toISOString().split('T')[0]
        });
      }

      localStorage.removeItem('mb_verify_' + email);
      this.toast('注册成功！', 'success');
      setTimeout(() => window.location.href = 'dashboard.html', 1500);
    } catch (err) {
      console.error('注册失败:', err);
      if (err.code === 'auth/email-already-in-use') {
        this.toast('该邮箱已注册', 'error');
      } else if (err.code === 'auth/weak-password') {
        this.toast('密码强度太弱', 'error');
      } else {
        this.toast('注册失败: ' + err.message, 'error');
      }
    }
  },

  // Vercel 邮件API
  MAIL_API: 'https://mini-brother-k4mn42p6t-panzaizhangs-projects.vercel.app/api/send-code',

  // 发送注册验证码
  async sendRegisterCode(email) {
    if (!email || !email.includes('@')) {
      this.toast('请输入有效的邮箱', 'error');
      return;
    }
    
    // 不再检查 localStorage，直接调用邮件 API
    // Firebase 会处理"邮箱已注册"的情况
    
    try {
      // 通过 Worker 调用 Resend API 发送邮件
      const res = await fetch(this.MAIL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // 保存验证码用于注册验证
        localStorage.setItem('mb_verify_' + email, JSON.stringify({
          code: data.code,
          expires: Date.now() + 5 * 60 * 1000
        }));
        this.toast('验证码已发送，请查收邮箱！', 'success');
      } else {
        this.toast(data.error || '发送失败', 'error');
      }
    } catch (err) {
      console.error('邮件发送错误:', err);
      this.toast('网络错误，请稍后重试', 'error');
    }
  },

  // 登出
  async logout() {
    if (this.auth && this.auth.currentUser) {
      await this.auth.signOut();
    }
    localStorage.removeItem('mb_current');
    localStorage.removeItem('mb_email');
    localStorage.removeItem('mb_uid');
    this._currentUser = null;
    this.toast('已退出登录', 'info');
    setTimeout(() => window.location.href = 'login.html', 800);
  },

  // ===== 渲染函数 =====
  renderDashboard() {
    const user = this.getCurrentUser();
    if (!user) return;
    const main = document.getElementById('mainContent');
    const sub = user.subscription;
    const today = new Date().toLocaleDateString('zh-CN');
    
    // 计算流量百分比
    const usedTraffic = user.traffic?.used || 0;
    const totalTraffic = sub ? parseInt(sub.traffic) || 100 : 100;
    const trafficPercent = Math.min(Math.round((usedTraffic / totalTraffic) * 100), 100);
    const subLink = this.generateSubLink(user);
    
    main.innerHTML = `
      <!-- 欢迎横幅 - 白月光风格 -->
      <div class="welcome-banner">
        <div class="welcome-banner-left">
          <h2>欢迎回来, ${user.email.split('@')[0]}</h2>
          <p>上次登录: ${today}</p>
        </div>
        <div class="welcome-banner-right">
          <div class="welcome-stat">
            <div class="welcome-stat-label">账户余额</div>
            <div class="welcome-stat-value primary">¥${user.balance || 0}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="location.href='shop.html'">充值</button>
        </div>
      </div>
      
      ${sub ? `
      <!-- 订阅信息卡片 - 白月光渐变风格 -->
      <div class="subscription-card">
        <div class="subscription-card-header">
          <span class="subscription-card-title">当前套餐</span>
          <span class="subscription-card-badge">运行中</span>
        </div>
        <div class="subscription-card-name">${sub.planName}</div>
        <div class="subscription-card-details">
          <div class="subscription-detail">
            <div class="subscription-detail-value">¥${sub.price}</div>
            <div class="subscription-detail-label">/月</div>
          </div>
          <div class="subscription-detail">
            <div class="subscription-detail-value">${sub.devices}</div>
            <div class="subscription-detail-label">设备数</div>
          </div>
          <div class="subscription-detail">
            <div class="subscription-detail-value">${sub.traffic}</div>
            <div class="subscription-detail-label">流量</div>
          </div>
        </div>
      </div>
      
      <!-- 流量使用卡片 -->
      <div class="traffic-card">
        <div class="traffic-header">
          <span class="traffic-title">流量使用</span>
          <a href="shop.html" style="font-size:13px;color:var(--accent);text-decoration:none;">续费套餐</a>
        </div>
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px;">
          <span class="traffic-value">${trafficPercent}%</span>
          <span class="traffic-total">${usedTraffic} GB / ${totalTraffic} GB</span>
        </div>
        <div class="traffic-progress">
          <div class="traffic-progress-fill" style="width:${trafficPercent}%;"></div>
        </div>
        <div class="traffic-stats">
          <div class="traffic-stat">
            <div class="traffic-stat-value">${(Math.random() * 100).toFixed(1)}</div>
            <div class="traffic-stat-label">上行 MB</div>
          </div>
          <div class="traffic-stat">
            <div class="traffic-stat-value">${usedTraffic}</div>
            <div class="traffic-stat-label">下行 GB</div>
          </div>
          <div class="traffic-stat">
            <div class="traffic-stat-value">1</div>
            <div class="traffic-stat-label">在线设备</div>
          </div>
          <div class="traffic-stat">
            <div class="traffic-stat-value">${totalTraffic}</div>
            <div class="traffic-stat-label">总流量 GB</div>
          </div>
        </div>
      </div>
      
      <!-- 在线设备卡片 -->
      <div class="device-card">
        <div class="device-header">
          <span class="device-title">当前已连接设备</span>
          <span class="device-count">1<span> / ${sub.devices} 台</span></span>
        </div>
        <div class="device-item">
          <span class="device-flag">🇭🇰</span>
          <div class="device-info">
            <div class="device-name">香港 01</div>
            <div class="device-location">${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)} 海南省海口市 电信</div>
          </div>
          <div class="device-status"></div>
        </div>
      </div>
      
      <!-- 系统公告卡片 -->
      <div class="notice-card">
        <div class="notice-title">系统公告</div>
        <div class="notice-list">
          <div class="notice-item">
            <span class="notice-date">04-10</span>
            <span class="notice-text">📢 部分用户入口域名变更通知</span>
          </div>
          <div class="notice-item">
            <span class="notice-date">04-04</span>
            <span class="notice-text">服务补偿通知：延长使用时间 3 天</span>
          </div>
          <div class="notice-item">
            <span class="notice-date">03-26</span>
            <span class="notice-text">【安全升级】系统新增订阅自动重置保护功能</span>
          </div>
        </div>
      </div>
      
      <!-- 订阅链接卡片 -->
      <div class="sublink-card">
        <div class="sublink-header">
          <span class="sublink-title">APP 订阅</span>
          <div class="sublink-actions-top">
            <button class="btn btn-outline btn-sm" onclick="resetKey()">重置密钥</button>
          </div>
        </div>
        
        <div class="app-list">
          <div class="app-item-new">
            <div class="app-icon-new" style="background:#eef2ff;">📱</div>
            <div class="app-info-new">
              <div class="app-name-new">Shadowrocket</div>
              <div class="app-desc-new">推荐 · 简单易用</div>
            </div>
            <div class="app-btn-group">
              <button class="btn btn-sm btn-outline" onclick="showSubQR()">二维码</button>
              <button class="btn btn-sm btn-primary" onclick="importSub()">一键导入</button>
            </div>
          </div>
          
          <div class="app-item-new">
            <div class="app-icon-new" style="background:#fce7f3;">S</div>
            <div class="app-info-new">
              <div class="app-name-new">Stash</div>
              <div class="app-desc-new">功能强大 · 规则灵活</div>
            </div>
            <div class="app-btn-group">
              <button class="btn btn-sm btn-outline" onclick="showSubQR()">二维码</button>
              <button class="btn btn-sm btn-primary" onclick="importSub()">一键导入</button>
            </div>
          </div>
          
          <div class="app-item-new">
            <div class="app-icon-new" style="background:#ecfdf5;">Q</div>
            <div class="app-info-new">
              <div class="app-name-new">Quantumult X</div>
              <div class="app-desc-new">进阶用户推荐</div>
            </div>
            <div class="app-btn-group">
              <button class="btn btn-sm btn-outline" onclick="showSubQR()">二维码</button>
              <button class="btn btn-sm btn-outline" onclick="copySubLink()">复制订阅</button>
            </div>
          </div>
          
          <div class="app-item-new">
            <div class="app-icon-new" style="background:#fef3c7;">Su</div>
            <div class="app-info-new">
              <div class="app-name-new">Surge</div>
              <div class="app-desc-new">专业级代理工具</div>
            </div>
            <div class="app-btn-group">
              <button class="btn btn-sm btn-outline" onclick="showSubQR()">二维码</button>
              <button class="btn btn-sm btn-primary" onclick="importSub()">一键导入</button>
            </div>
          </div>
        </div>
        
        <div class="sublink-input-row">
          <input type="text" class="sublink-input" id="subLink" value="${subLink}" readonly onclick="this.select()">
          <button class="btn btn-primary btn-sm" onclick="copySubLink()">复制链接</button>
        </div>
        
        <p class="sublink-warning">⚠️ 请不要使用代理更新订阅</p>
        <p class="sublink-tip">重置密钥后所有旧链接将失效</p>
      </div>
      ` : `
      <!-- 无订阅状态 -->
      <div class="card" style="text-align:center;padding:60px;">
        <div style="font-size:64px;margin-bottom:20px;">📡</div>
        <h3 style="font-size:20px;font-weight:700;margin-bottom:8px;">暂无订阅</h3>
        <p style="font-size:14px;color:var(--text-tertiary);margin-bottom:24px;">您还没有购买任何套餐</p>
        <a href="shop.html" class="btn btn-primary">前往商店</a>
      </div>
      `}
    `;
  },

  generateSubLink(user) {
    if (!user.subscription) return '';
    return 'vmess://' + btoa(JSON.stringify({
      v: '2',
      ps: '迷你兄弟-' + user.subscription.planName,
      add: 'node.asiassn.com',
      port: '443',
      id: user.email.substring(0, 8) + '-' + Date.now().toString(36),
      net: 'ws',
      type: 'none',
      path: '/v2',
      tls: 'tls'
    }));
  },

  renderSubscriptionManage() {
    const user = this.getCurrentUser();
    if (!user) return;
    const main = document.getElementById('mainContent');
    
    if (!user.subscription) {
      main.innerHTML = `
        <!-- 未订阅状态 -->
        <div class="page-header">
          <h1 class="page-title">订阅管理</h1>
          <p class="page-subtitle">管理您的订阅套餐</p>
        </div>
        
        <div class="unsubscribed-hero">
          <div class="unsubscribed-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
            </svg>
          </div>
          <h2 class="unsubscribed-title">开启您的专属网络体验</h2>
          <p class="unsubscribed-desc">选择适合您的套餐，享受高速稳定的全球网络服务</p>
        </div>
        
        <div class="card-grid card-grid-3">
          <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <h3>极速连接</h3>
            <p>优化线路，延迟低至50ms，畅享高速网络</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🛡️</div>
            <h3>安全加密</h3>
            <p>AES-256军事级加密，保护您的隐私安全</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🌍</div>
            <h3>全球覆盖</h3>
            <p>50+国家/地区节点，随时随地畅连世界</p>
          </div>
        </div>
        
        <div class="cta-section">
          <h3>选择您的专属套餐</h3>
          <p>灵活的套餐方案，满足不同需求</p>
          <a href="shop.html" class="btn btn-primary btn-lg">
            <span>前往商店</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M5 12h14m-7-7l7 7-7 7"/>
            </svg>
          </a>
        </div>
      `;
      return;
    }
    
    const sub = user.subscription;
    main.innerHTML = `
      <div class="card-grid card-grid-2" style="margin-bottom:24px;">
        <div class="card">
          <h3 style="font-size:16px;font-weight:700;margin-bottom:20px;">当前套餐</h3>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
            <span style="font-size:28px;font-weight:700;color:var(--primary);">${sub.planName}</span>
            <span class="badge badge-success">活跃</span>
          </div>
          <div style="display:grid;gap:12px;">
            <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
              <span style="color:var(--text-tertiary);">设备数</span>
              <span style="font-weight:600;">${sub.devices}台</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
              <span style="color:var(--text-tertiary);">流量额度</span>
              <span style="font-weight:600;">${sub.traffic}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
              <span style="color:var(--text-tertiary);">到期时间</span>
              <span style="font-weight:600;">${sub.expireAt}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:12px 0;">
              <span style="color:var(--text-tertiary);">套餐价格</span>
              <span style="font-weight:600;color:var(--primary);">¥${sub.price}/月</span>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h3 style="font-size:16px;font-weight:700;margin-bottom:20px;">订阅链接</h3>
          <div style="display:flex;gap:12px;margin-bottom:16px;">
            <input type="text" class="form-input" id="subLink" value="${this.generateSubLink(user)}" readonly onclick="this.select()" style="flex:1;font-family:monospace;font-size:12px;">
            <button class="btn btn-outline" onclick="copySubLink()">复制</button>
          </div>
          <p style="font-size:13px;color:var(--text-tertiary);">复制链接后在您的APP中导入订阅</p>
        </div>
      </div>
      
      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;">支持的应用</h3>
      <div class="card">
        <div class="list-item">
          <div class="list-item-icon" style="background:#eef2ff;">🌐</div>
          <div class="list-item-content">
            <div class="list-item-title">Shadowrocket</div>
            <div class="list-item-subtitle">iOS 推荐</div>
          </div>
          <div class="list-item-action">
            <button class="btn btn-sm btn-outline" onclick="copySubLink()">复制订阅</button>
          </div>
        </div>
        <div class="list-item">
          <div class="list-item-icon" style="background:#fce7f3;">📱</div>
          <div class="list-item-content">
            <div class="list-item-title">Stash / Clash</div>
            <div class="list-item-subtitle">通用订阅格式</div>
          </div>
          <div class="list-item-action">
            <button class="btn btn-sm btn-outline" onclick="copySubLink()">复制订阅</button>
          </div>
        </div>
        <div class="list-item">
          <div class="list-item-icon" style="background:#ecfdf5;">💻</div>
          <div class="list-item-content">
            <div class="list-item-title">V2rayN / NekoRay</div>
            <div class="list-item-subtitle">Windows/Android</div>
          </div>
          <div class="list-item-action">
            <button class="btn btn-sm btn-outline" onclick="copySubLink()">复制订阅</button>
          </div>
        </div>
      </div>
    `;
  },

  renderOrders() {
    const user = this.getCurrentUser();
    if (!user) return;
    const container = document.getElementById('ordersContent');
    
    if (!user.orders || user.orders.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:60px;">
          <div style="font-size:64px;margin-bottom:20px;">📦</div>
          <h3 style="font-size:20px;font-weight:700;margin-bottom:8px;">暂无订单</h3>
          <p style="font-size:14px;color:var(--text-tertiary);margin-bottom:24px;">您还没有购买任何套餐</p>
          <a href="shop.html" class="btn btn-primary">前往商店</a>
        </div>
      `;
      return;
    }
    
    const statusMap = { pending: '待支付', paid: '已完成', refunded: '已退款' };
    const statusClass = { pending: 'warning', paid: 'success', refunded: 'danger' };
    
    container.innerHTML = `
      <div class="card">
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>订单号</th>
                <th>套餐</th>
                <th>金额</th>
                <th>支付方式</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              ${user.orders.map(order => `
                <tr>
                  <td style="font-family:monospace;font-size:12px;">${order.id}</td>
                  <td><strong>${order.planName}</strong></td>
                  <td style="font-weight:600;color:var(--primary);">¥${order.price}</td>
                  <td>${order.method === 'wechat' ? '微信支付' : order.method === 'alipay' ? '支付宝' : '银行卡'}</td>
                  <td><span class="badge badge-${statusClass[order.status]}">${statusMap[order.status]}</span></td>
                  <td style="color:var(--text-tertiary);">${order.createdAt}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderProfile() {
    const user = this.getCurrentUser();
    if (!user) return;
    const main = document.getElementById('profileContent');
    
    main.innerHTML = `
      <div class="card-grid card-grid-2" style="margin-bottom:20px;">
        <div class="card">
          <div class="section-title">个人信息</div>
          <div class="form-group">
            <label class="form-label">邮箱</label>
            <input type="email" class="form-input" value="${user.email}" readonly>
          </div>
          <div class="form-group">
            <label class="form-label">昵称</label>
            <input type="text" class="form-input" id="profileName" value="${user.name || ''}" placeholder="输入昵称">
          </div>
          <div class="form-group">
            <label class="form-label">注册时间</label>
            <input type="text" class="form-input" value="${user.createdAt}" readonly>
          </div>
          <button class="btn btn-primary" onclick="saveProfile()">保存修改</button>
        </div>
        
        <div class="card">
          <div class="section-title">账户统计</div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-item-label">账户余额</span>
              <span class="info-item-value" style="color:var(--primary);font-weight:600;">¥${user.balance || 0}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">累计佣金</span>
              <span class="info-item-value" style="color:var(--success);font-weight:600;">¥${user.totalCommission || 0}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">可提现</span>
              <span class="info-item-value">¥${user.withdrawable || 0}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">邀请用户</span>
              <span class="info-item-value">${user.invitedCount || 0}人</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <div class="section-title">修改密码</div>
        <div class="form-group">
          <label class="form-label">当前密码</label>
          <input type="password" class="form-input" id="currentPwd" placeholder="输入当前密码">
        </div>
        <div class="form-group">
          <label class="form-label">新密码</label>
          <input type="password" class="form-input" id="newPwd" placeholder="输入新密码（至少8位）">
        </div>
        <div class="form-group">
          <label class="form-label">确认新密码</label>
          <input type="password" class="form-input" id="confirmPwd" placeholder="再次输入新密码">
        </div>
        <button class="btn btn-outline" onclick="changePassword()">修改密码</button>
      </div>
    `;
  },

  renderInvite() {
    const user = this.getCurrentUser();
    if (!user) return;
    const main = document.getElementById('inviteContent');
    
    main.innerHTML = `
      <!-- 统计卡片 -->
      <div class="card-grid card-grid-3" style="margin-bottom:20px;">
        <div class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>
            </div>
          </div>
          <div class="stat-value">${user.invitedCount || 0}</div>
          <div class="stat-label">已邀请用户</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
          </div>
          <div class="stat-value">¥${user.totalCommission || 0}</div>
          <div class="stat-label">累计佣金</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon orange">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
          </div>
          <div class="stat-value">¥${user.withdrawable || 0}</div>
          <div class="stat-label">可提现金额</div>
        </div>
      </div>
      
      <!-- 邀请码 -->
      <div class="card" style="margin-bottom:20px;">
        <div class="section-title">您的邀请码</div>
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="flex:1;padding:16px;background:var(--bg);border-radius:var(--radius-sm);text-align:center;">
            <span style="font-size:28px;font-weight:700;color:var(--primary);letter-spacing:4px;">${user.inviteCode}</span>
          </div>
          <button class="btn btn-primary" onclick="copyInviteCode()">复制邀请码</button>
        </div>
        <p style="font-size:13px;color:var(--text-tertiary);margin-top:12px;">分享您的邀请码，好友注册时填写即可获得佣金</p>
      </div>
      
      <!-- 返利规则 -->
      <div class="card">
        <div class="section-title">返利规则</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:var(--bg);border-radius:var(--radius-sm);">
            <span style="width:24px;height:24px;background:var(--primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;flex-shrink:0;">1</span>
            <div>
              <div style="font-weight:500;margin-bottom:3px;font-size:13px;">邀请奖励</div>
              <div style="font-size:12px;color:var(--text-secondary);">每成功邀请1位用户购买套餐，您将获得订单金额的20%作为佣金</div>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:var(--bg);border-radius:var(--radius-sm);">
            <span style="width:24px;height:24px;background:var(--primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;flex-shrink:0;">2</span>
            <div>
              <div style="font-weight:500;margin-bottom:3px;font-size:13px;">提现门槛</div>
              <div style="font-size:12px;color:var(--text-secondary);">佣金满100元后可申请提现，审核后24小时内到账</div>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:var(--bg);border-radius:var(--radius-sm);">
            <span style="width:24px;height:24px;background:var(--primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;flex-shrink:0;">3</span>
            <div>
              <div style="font-weight:500;margin-bottom:3px;font-size:13px;">永久有效</div>
              <div style="font-size:12px;color:var(--text-secondary);">邀请码永久有效，邀请关系不会失效</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
};

// 全局函数
function copySubLink() {
  const link = document.getElementById('subLink');
  if (!link) return;
  navigator.clipboard.writeText(link.value).then(() => {
    MB.toast('订阅链接已复制', 'success');
  });
}

function showSubQR() {
  MB.toast('二维码功能演示中', 'info');
}

function importSub() {
  MB.toast('一键导入功能演示中', 'info');
}

function resetKey() {
  if (confirm('确定要重置密钥吗？重置后所有旧链接将失效。')) {
    MB.toast('密钥已重置', 'success');
  }
}

function copyInviteCode() {
  const user = MB.getCurrentUser();
  if (!user) return;
  navigator.clipboard.writeText(user.inviteCode).then(() => {
    MB.toast('邀请码已复制', 'success');
  });
}

function saveProfile() {
  const name = document.getElementById('profileName').value.trim();
  const user = MB.getCurrentUser();
  if (!user) return;
  user.name = name || user.email.split('@')[0];
  MB._users[user.email] = user;
  MB.saveUsers();
  MB.toast('保存成功', 'success');
}

function changePassword() {
  const currentPwd = document.getElementById('currentPwd').value;
  const newPwd = document.getElementById('newPwd').value;
  const confirmPwd = document.getElementById('confirmPwd').value;
  const user = MB.getCurrentUser();
  if (!user) return;
  
  if (!currentPwd || !newPwd || !confirmPwd) {
    MB.toast('请填写所有字段', 'error');
    return;
  }
  
  if (MB.hashPassword(currentPwd) !== user.password) {
    MB.toast('当前密码错误', 'error');
    return;
  }
  
  if (newPwd.length < 8) {
    MB.toast('新密码至少8位', 'error');
    return;
  }
  
  if (newPwd !== confirmPwd) {
    MB.toast('两次密码不一致', 'error');
    return;
  }
  
  user.password = MB.hashPassword(newPwd);
  MB._users[user.email] = user;
  MB.saveUsers();
  MB.toast('密码修改成功', 'success');
  document.getElementById('currentPwd').value = '';
  document.getElementById('newPwd').value = '';
  document.getElementById('confirmPwd').value = '';
}

// ===== 表单初始化 =====
document.addEventListener('DOMContentLoaded', function() {
  // 登录表单
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      MB.handleLogin();
    });
  }
  
  // 注册表单
  const regForm = document.getElementById('registerForm');
  if (regForm) {
    regForm.addEventListener('submit', function(e) {
      e.preventDefault();
      MB.handleRegister();
    });
  }
});

// 全局pendingEmail变量
let pendingEmail = '';

// ===== 工具页面渲染 =====

// 工单页面
MB.renderTicket = function() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header">
      <h1>我的工单</h1>
      <button class="btn btn-primary" onclick="MB.newTicket()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        提交工单
      </button>
    </div>
    
    <div class="card" style="text-align:center;padding:60px;">
      <div style="font-size:64px;margin-bottom:20px;">🎫</div>
      <h3 style="font-size:20px;font-weight:700;margin-bottom:8px;">暂无工单</h3>
      <p style="font-size:14px;color:var(--text-tertiary);margin-bottom:24px;">您还没有提交任何工单</p>
      <button class="btn btn-primary" onclick="MB.newTicket()">提交第一个工单</button>
    </div>
  `;
};

// 新建工单弹窗
MB.newTicket = function() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header">
      <h1>提交工单</h1>
      <button class="btn btn-outline" onclick="MB.renderTicket()">返回列表</button>
    </div>
    
    <div class="card">
      <div style="display:grid;gap:20px;">
        <div>
          <label style="display:block;font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text-primary);">工单类型</label>
          <select id="ticketType" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);">
            <option value="tech">技术问题</option>
            <option value="billing">账单问题</option>
            <option value="account">账户问题</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text-primary);">问题描述</label>
          <textarea id="ticketDesc" rows="6" placeholder="请详细描述您遇到的问题..." style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);resize:vertical;"></textarea>
        </div>
        <div>
          <button class="btn btn-primary" onclick="MB.submitTicket()">提交工单</button>
        </div>
      </div>
    </div>
  `;
};

MB.submitTicket = function() {
  const type = document.getElementById('ticketType').value;
  const desc = document.getElementById('ticketDesc').value.trim();
  if (!desc) {
    this.toast('请填写问题描述', 'error');
    return;
  }
  this.toast('工单提交成功！我们会尽快处理', 'success');
  setTimeout(() => this.renderTicket(), 1500);
};

// 使用文档页面
MB.renderDocs = function() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header">
      <h1>使用文档</h1>
    </div>
    
    <div class="card-grid card-grid-2">
      <div class="card card-clickable" onclick="MB.showDoc('ios')">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:48px;height:48px;background:#eef2ff;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">🍎</div>
          <div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">iOS 客户端</h3>
            <p style="font-size:13px;color:var(--text-tertiary);">Shadowrocket / Stash / Quantumult X</p>
          </div>
        </div>
      </div>
      
      <div class="card card-clickable" onclick="MB.showDoc('android')">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:48px;height:48px;background:#dcfce7;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">🤖</div>
          <div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">Android 客户端</h3>
            <p style="font-size:13px;color:var(--text-tertiary);">V2rayNG / Clash</p>
          </div>
        </div>
      </div>
      
      <div class="card card-clickable" onclick="MB.showDoc('windows')">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:48px;height:48px;background:#dbeafe;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">🖥️</div>
          <div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">Windows 客户端</h3>
            <p style="font-size:13px;color:var(--text-tertiary);">V2rayN / Clash Verge</p>
          </div>
        </div>
      </div>
      
      <div class="card card-clickable" onclick="MB.showDoc('mac')">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:48px;height:48px;background:#f3e8ff;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">💻</div>
          <div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">macOS 客户端</h3>
            <p style="font-size:13px;color:var(--text-tertiary);">Surge / ClashX</p>
          </div>
        </div>
      </div>
    </div>
    
    <div class="card" style="margin-top:24px;">
      <h3 style="font-size:18px;font-weight:700;margin-bottom:16px;">常见问题</h3>
      <div class="faq-list">
        <details class="faq-item">
          <summary>如何导入订阅链接？</summary>
          <p>在控制台首页复制您的订阅链接，然后粘贴到对应APP的订阅设置中即可。</p>
        </details>
        <details class="faq-item">
          <summary>订阅更新失败怎么办？</summary>
          <p>请尝试手动复制订阅链接，避免使用代理更新订阅。如果问题持续，请提交工单。</p>
        </details>
        <details class="faq-item">
          <summary>如何切换节点？</summary>
          <p>订阅导入后，APP会自动获取所有可用节点，您可以在APP内自由切换。</p>
        </details>
        <details class="faq-item">
          <summary>流量用完了怎么办？</summary>
          <p>您可以在商店页面续费或升级套餐，流量将立即到账。</p>
        </details>
      </div>
    </div>
  `;
};

MB.showDoc = function(platform) {
  const docs = {
    ios: { title: '🍎 iOS 客户端配置教程', steps: ['在 App Store 下载 Shadowrocket（或 Stash/Quantumult X）', '打开 APP，点击右上角 "+"', '选择 "Subscribe" 或 "订阅"', '粘贴您的订阅链接', '点击 "完成" 即可'] },
    android: { title: '🤖 Android 客户端配置教程', steps: ['下载 V2rayNG 或 Clash', '打开 APP，点击左上角菜单', '选择 "订阅" 或 "订阅管理"', '添加订阅，粘贴您的订阅链接', '保存并更新订阅'] },
    windows: { title: '🖥️ Windows 客户端配置教程', steps: ['下载 V2rayN 或 Clash Verge', '打开软件，点击订阅管理', '添加订阅，粘贴您的订阅链接', '点击确定，然后更新订阅', '选择节点并连接'] },
    mac: { title: '💻 macOS 客户端配置教程', steps: ['下载 Surge 或 ClashX', '打开 APP，进入配置页面', '添加订阅，粘贴您的订阅链接', '更新订阅，获取节点列表', '选择节点并启动代理'] }
  };
  
  const doc = docs[platform];
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header">
      <h1>${doc.title}</h1>
      <button class="btn btn-outline" onclick="MB.renderDocs()">返回文档列表</button>
    </div>
    
    <div class="card">
      <h3 style="font-size:18px;font-weight:700;margin-bottom:20px;">配置步骤</h3>
      <div style="display:grid;gap:16px;">
        ${doc.steps.map((step, i) => `
          <div style="display:flex;gap:16px;align-items:flex-start;">
            <div style="width:32px;height:32px;background:var(--primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">${i + 1}</div>
            <div style="padding-top:4px;">${step}</div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div class="card" style="margin-top:24px;background:#fef3c7;border:1px solid #fcd34d;">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">💡 提示</h3>
      <p style="font-size:14px;color:var(--text-secondary);line-height:1.6;">如果导入后无法使用，请在订阅设置中开启"自动更新"选项。遇到问题可随时提交工单联系我们。</p>
    </div>
  `;
};

// 节点列表页面
MB.renderNodes = function() {
  const main = document.getElementById('mainContent');
  const nodes = [
    { name: '🇭🇰 香港-01', country: '香港', city: 'Hong Kong', load: 45, ping: 23, type: '优质' },
    { name: '🇭🇰 香港-02', country: '香港', city: 'Hong Kong', load: 32, ping: 25, type: '优质' },
    { name: '🇯🇵 日本-01', country: '日本', city: 'Tokyo', load: 58, ping: 42, type: '优质' },
    { name: '🇯🇵 日本-02', country: '日本', city: 'Tokyo', load: 67, ping: 45, type: '基础' },
    { name: '🇸🇬 新加坡-01', country: '新加坡', city: 'Singapore', load: 23, ping: 56, type: '优质' },
    { name: '🇺🇸 美国-01', country: '美国', city: 'Los Angeles', load: 41, ping: 120, type: '优质' },
    { name: '🇺🇸 美国-02', country: '美国', city: 'New York', load: 55, ping: 150, type: '基础' },
    { name: '🇰🇷 韩国-01', country: '韩国', city: 'Seoul', load: 38, ping: 38, type: '优质' },
    { name: '🇹🇼 台湾-01', country: '台湾', city: 'Taipei', load: 29, ping: 35, type: '优质' },
    { name: '🇬🇧 英国-01', country: '英国', city: 'London', load: 22, ping: 180, type: '专线' },
    { name: '🇩🇪 德国-01', country: '德国', city: 'Frankfurt', load: 35, ping: 165, type: '专线' },
    { name: '🇦🇺 澳洲-01', country: '澳洲', city: 'Sydney', load: 18, ping: 200, type: '专线' }
  ];
  
  main.innerHTML = `
    <div class="page-header">
      <h1>节点列表</h1>
      <div style="display:flex;gap:12px;align-items:center;">
        <select id="nodeFilter" onchange="MB.filterNodes()" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-primary);">
          <option value="all">全部节点</option>
          <option value="优质">优质线路</option>
          <option value="专线">专线线路</option>
          <option value="基础">基础线路</option>
        </select>
      </div>
    </div>
    
    <div id="nodesContainer" class="card-grid card-grid-3">
      ${nodes.map(node => `
        <div class="card" data-type="${node.type}" style="position:relative;overflow:hidden;">
          <div style="position:absolute;top:0;right:0;padding:4px 8px;background:${node.type === '优质' ? 'var(--success)' : node.type === '专线' ? 'var(--accent)' : 'var(--text-tertiary)'};color:white;font-size:11px;border-radius:0 14px 0 8px;">${node.type}</div>
          <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">${node.name}</h3>
          <p style="font-size:13px;color:var(--text-tertiary);margin-bottom:16px;">${node.city}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
            <div>
              <span style="color:var(--text-tertiary);">负载</span>
              <div style="font-weight:600;margin-top:4px;">${node.load}%</div>
            </div>
            <div>
              <span style="color:var(--text-tertiary);">延迟</span>
              <div style="font-weight:600;margin-top:4px;">${node.ping}ms</div>
            </div>
          </div>
          <div style="margin-top:16px;height:4px;background:var(--border-light);border-radius:2px;">
            <div style="height:100%;width:${100-node.load}%;background:${node.load < 50 ? 'var(--success)' : node.load < 80 ? '#f59e0b' : 'var(--danger)'};border-radius:2px;"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

MB.filterNodes = function() {
  const filter = document.getElementById('nodeFilter').value;
  const cards = document.querySelectorAll('#nodesContainer .card');
  cards.forEach(card => {
    if (filter === 'all' || card.dataset.type === filter) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
};

// 苹果账号页面
MB.renderApple = function() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header">
      <h1>苹果账号</h1>
    </div>
    
    <div class="card" style="text-align:center;padding:60px;">
      <div style="font-size:64px;margin-bottom:20px;">🍎</div>
      <h3 style="font-size:20px;font-weight:700;margin-bottom:8px;">共享苹果账号</h3>
      <p style="font-size:14px;color:var(--text-tertiary);margin-bottom:24px;max-width:400px;margin-left:auto;margin-right:auto;">订阅用户可免费使用共享苹果账号，用于下载海外APP</p>
      
      <div style="background:var(--bg-secondary);border-radius:12px;padding:20px;margin-bottom:24px;text-align:left;max-width:400px;margin-left:auto;margin-right:auto;">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:var(--text-tertiary);">账号</span>
          <span style="font-weight:600;" id="appleId">vip@example.com</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:var(--text-tertiary);">密码</span>
          <span style="font-weight:600;" id="applePwd">MiniBrother2024</span>
        </div>
      </div>
      
      <button class="btn btn-primary" onclick="MB.copyApple()">复制账号信息</button>
      
      <div style="margin-top:24px;padding:16px;background:#fef3c7;border-radius:8px;text-align:left;max-width:400px;margin-left:auto;margin-right:auto;">
        <p style="font-size:13px;color:#92400e;line-height:1.6;">
          <strong>⚠️ 使用提示：</strong><br>
          1. 请勿登录iCloud<br>
          2. 下载完成后建议退出登录<br>
          3. 账号密码每周更新
        </p>
      </div>
    </div>
  `;
};

MB.copyApple = function() {
  const id = document.getElementById('appleId').textContent;
  const pwd = document.getElementById('applePwd').textContent;
  navigator.clipboard.writeText('账号: ' + id + '\n密码: ' + pwd);
  this.toast('账号信息已复制', 'success');
};

// 侧边栏激活状态切换
function setActive(el) {
  document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}

// 套餐资费页面
MB.renderPricing = function() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">套餐资费</h1>
      <p class="page-subtitle">选择适合您的套餐，随时可升级</p>
    </div>

    <div class="card-grid card-grid-3" style="margin-bottom:32px;">
      <!-- 入门版 -->
      <div class="card" style="position:relative;border:2px solid var(--border-light);transition:box-shadow 0.2s;">
        <div style="position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--text-secondary);color:white;padding:4px 18px;border-radius:20px;font-size:12px;font-weight:700;">入门版</div>
        <div style="text-align:center;padding:20px 0 16px;">
          <div style="font-size:42px;font-weight:800;color:var(--text-primary);">¥88</div>
          <div style="font-size:13px;color:var(--text-tertiary);">/ 月</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 100GB 月流量
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 2 台设备同时使用
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 香港/日本 节点
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 标准速度
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text-tertiary);">
            <span>✗</span> 专线节点
          </div>
        </div>
        <a href="shop.html" class="btn btn-outline" style="width:100%;text-align:center;display:block;height:44px;line-height:44px;padding:0;">立即购买</a>
      </div>

      <!-- 标准版（推荐） -->
      <div class="card" style="position:relative;border:2px solid var(--primary);box-shadow:0 8px 32px rgba(102,126,234,0.18);">
        <div style="position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#667eea,#764ba2);color:white;padding:4px 18px;border-radius:20px;font-size:12px;font-weight:700;">推荐</div>
        <div style="text-align:center;padding:20px 0 16px;">
          <div style="font-size:42px;font-weight:800;color:var(--primary);">¥218</div>
          <div style="font-size:13px;color:var(--text-tertiary);">/ 月</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 300GB 月流量
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 5 台设备同时使用
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 全部节点可用
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 高速专线
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 优先客服支持
          </div>
        </div>
        <a href="shop.html" class="btn btn-primary" style="width:100%;text-align:center;display:block;height:44px;line-height:44px;padding:0;">立即购买</a>
      </div>

      <!-- 专业版 -->
      <div class="card" style="position:relative;border:2px solid var(--border-light);transition:box-shadow 0.2s;">
        <div style="position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--text-secondary);color:white;padding:4px 18px;border-radius:20px;font-size:12px;font-weight:700;">专业版</div>
        <div style="text-align:center;padding:20px 0 16px;">
          <div style="font-size:42px;font-weight:800;color:var(--text-primary);">¥270</div>
          <div style="font-size:13px;color:var(--text-tertiary);">/ 月</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 不限流量
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 不限设备数量
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 全部节点 + 专属节点
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> IPLC 国际专线
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:14px;">
            <span style="color:var(--success);">✓</span> 24小时专属客服
          </div>
        </div>
        <a href="shop.html" class="btn btn-outline" style="width:100%;text-align:center;display:block;height:44px;line-height:44px;padding:0;">立即购买</a>
      </div>
    </div>

    <!-- 对比表格 -->
    <div class="card">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:20px;">套餐对比</h3>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>功能</th>
              <th style="text-align:center;">入门版 ¥88</th>
              <th style="text-align:center;color:var(--primary);">标准版 ¥218</th>
              <th style="text-align:center;">专业版 ¥270</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>月流量</td><td style="text-align:center;">100GB</td><td style="text-align:center;font-weight:600;color:var(--primary);">300GB</td><td style="text-align:center;">不限</td></tr>
            <tr><td>同时设备数</td><td style="text-align:center;">2台</td><td style="text-align:center;font-weight:600;color:var(--primary);">5台</td><td style="text-align:center;">不限</td></tr>
            <tr><td>香港/日本节点</td><td style="text-align:center;">✓</td><td style="text-align:center;color:var(--primary);">✓</td><td style="text-align:center;">✓</td></tr>
            <tr><td>美国/欧洲节点</td><td style="text-align:center;color:var(--text-tertiary);">✗</td><td style="text-align:center;color:var(--primary);">✓</td><td style="text-align:center;">✓</td></tr>
            <tr><td>IPLC专线</td><td style="text-align:center;color:var(--text-tertiary);">✗</td><td style="text-align:center;color:var(--text-tertiary);">✗</td><td style="text-align:center;">✓</td></tr>
            <tr><td>客服支持</td><td style="text-align:center;">工单</td><td style="text-align:center;color:var(--primary);">优先工单</td><td style="text-align:center;">24h专属</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
};

// 节点测速工具
MB.renderSpeedTest = function() {
  const main = document.getElementById('mainContent');
  const nodes = [
    { name: '🇭🇰 香港-01', ip: '103.ABC.XX.1', latency: 23 },
    { name: '🇭🇰 香港-02', ip: '103.ABC.XX.2', latency: 25 },
    { name: '🇯🇵 日本-01', ip: '104.XYZ.XX.1', latency: 42 },
    { name: '🇸🇬 新加坡-01', ip: '107.UVW.XX.1', latency: 56 },
    { name: '🇺🇸 美国-01', ip: '108.PQR.XX.1', latency: 120 },
    { name: '🇰🇷 韩国-01', ip: '106.MNO.XX.1', latency: 38 },
    { name: '🇹🇼 台湾-01', ip: '105.DEF.XX.1', latency: 35 },
    { name: '🇬🇧 英国-01', ip: '109.GHI.XX.1', latency: 180 },
  ];

  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">节点测速</h1>
      <button class="btn btn-primary btn-sm" onclick="MB.doSpeedTest()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        刷新测速
      </button>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-secondary);border-radius:var(--radius);">
        <div style="width:48px;height:48px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;">⚡</div>
        <div>
          <div style="font-size:14px;font-weight:600;">点击刷新测速开始测延迟</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">测速通过 ICMP ping 测量节点响应时间</div>
        </div>
      </div>
    </div>

    <div class="card-grid card-grid-3">
      ${nodes.map(node => `
        <div class="card speed-card" data-latency="${node.latency}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="font-size:16px;font-weight:700;">${node.name}</div>
            <div class="speed-badge" style="background:${node.latency < 50 ? '#dcfce7' : node.latency < 100 ? '#fef9c3' : '#fee2e2'};color:${node.latency < 50 ? '#16a34a' : node.latency < 100 ? '#ca8a04' : '#dc2626'};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">
              ${node.latency}ms
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);font-family:monospace;">${node.ip}</div>
          <div style="margin-top:12px;height:4px;background:var(--border-light);border-radius:2px;">
            <div style="height:100%;width:${Math.max(10, 100 - node.latency * 0.6)}%;background:${node.latency < 50 ? 'var(--success)' : node.latency < 100 ? '#f59e0b' : 'var(--danger)'};border-radius:2px;transition:width 0.6s;"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

MB.doSpeedTest = function() {
  this.toast('正在测速中...', 'info');
  setTimeout(() => this.toast('测速完成！', 'success'), 1500);
};

// IP 查询工具
MB.renderIPCheck = function() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">IP 查询</h1>
      <button class="btn btn-primary btn-sm" onclick="MB.doIPCheck()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        刷新
      </button>
    </div>

    <div class="card-grid card-grid-2" style="margin-bottom:20px;">
      <div class="card">
        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px;">当前 IP 地址</div>
        <div style="font-size:28px;font-weight:700;font-family:monospace;" id="ipResult">检测中...</div>
      </div>
      <div class="card">
        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px;">网络状态</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div id="vpnStatus" style="width:12px;height:12px;background:#dcfce7;border-radius:50%;"></div>
          <span style="font-size:16px;font-weight:600;" id="vpnText">检测中...</span>
        </div>
      </div>
    </div>

    <div class="card" id="ipDetailCard">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:20px;">IP 详细信息</h3>
      <div style="display:grid;gap:14px;">
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <span style="color:var(--text-tertiary);">国家/地区</span>
          <span style="font-weight:600;" id="detailCountry">--</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <span style="color:var(--text-tertiary);">城市</span>
          <span style="font-weight:600;" id="detailCity">--</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <span style="color:var(--text-tertiary);">行政区</span>
          <span style="font-weight:600;" id="detailRegion">--</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <span style="color:var(--text-tertiary);">运营商/组织</span>
          <span style="font-weight:600;" id="detailOrg">--</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <span style="color:var(--text-tertiary);">ASN</span>
          <span style="font-weight:600;" id="detailAsn">--</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <span style="color:var(--text-tertiary);">经纬度</span>
          <span style="font-weight:600;" id="detailCoords">--</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-light);">
          <span style="color:var(--text-tertiary);">时区</span>
          <span style="font-weight:600;" id="detailTimezone">--</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;">
          <span style="color:var(--text-tertiary);">货币</span>
          <span style="font-weight:600;" id="detailCurrency">--</span>
        </div>
      </div>
    </div>
  `;
  MB.doIPCheck();
};

MB.doIPCheck = function() {
  const elIp = document.getElementById('ipResult');
  const elStatus = document.getElementById('vpnStatus');
  const elVpnText = document.getElementById('vpnText');
  if (!elIp) return;
  elIp.textContent = '检测中...';
  if (elStatus) elStatus.style.background = '#fef3c7';
  if (elVpnText) { elVpnText.textContent = '检测中...'; elVpnText.style.color = 'var(--text-tertiary)'; }

  // 通过 Vercel Serverless Function 代理查询（绕过防火墙）
  fetch('/api/ip-check')
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(res => {
      if (res.success && res.data) {
        const d = res.data;
        elIp.textContent = d.ip;
        const isChina = d.countryCode === 'CN';
        if (elStatus) elStatus.style.background = isChina ? '#fecaca' : '#dcfce7';
        if (elVpnText) { elVpnText.textContent = isChina ? '国内直连' : '已连接代理'; elVpnText.style.color = isChina ? 'var(--danger)' : 'var(--success)'; }
        const countryEl = document.getElementById('detailCountry');
        if (countryEl) countryEl.textContent = (d.countryFlag || (isChina ? '🇨🇳' : '')) + ' ' + (d.country || '--');
        const cityEl = document.getElementById('detailCity');
        if (cityEl) cityEl.textContent = d.city || '--';
        const regionEl = document.getElementById('detailRegion');
        if (regionEl) regionEl.textContent = d.region || '--';
        const orgEl = document.getElementById('detailOrg');
        if (orgEl) orgEl.textContent = d.org || '--';
        const asnEl = document.getElementById('detailAsn');
        if (asnEl) asnEl.textContent = d.asn || '--';
        const coordsEl = document.getElementById('detailCoords');
        if (coordsEl) coordsEl.textContent = d.lat && d.lon ? d.lat.toFixed(4) + ', ' + d.lon.toFixed(4) : '--';
        const tzEl = document.getElementById('detailTimezone');
        if (tzEl) tzEl.textContent = d.timezone || '--';
        const currencyEl = document.getElementById('detailCurrency');
        if (currencyEl) currencyEl.textContent = d.currency || '--';
      } else {
        throw new Error(res.error || '查询失败');
      }
    })
    .catch(err => {
      console.error('IP查询失败:', err);
      elIp.textContent = '检测失败';
      if (elStatus) elStatus.style.background = '#fecaca';
      if (elVpnText) { elVpnText.textContent = '检测失败'; elVpnText.style.color = 'var(--danger)'; }
    });
};

// 兑换码工具
MB.renderRedeem = function() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">兑换码</h1>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:16px;padding:16px;background:linear-gradient(90deg,#fef9c3,#d1fae5);border-radius:var(--radius);margin-bottom:24px;">
        <div style="font-size:28px;">🎁</div>
        <div>
          <div style="font-size:15px;font-weight:700;">输入兑换码</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">兑换码可用于充值余额、续费套餐或兑换指定套餐</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;">
        <input type="text" id="redeemCode" class="form-input" placeholder="请输入兑换码" style="flex:1;font-family:monospace;font-size:15px;letter-spacing:2px;text-transform:uppercase;">
        <button class="btn btn-primary" onclick="MB.doRedeem()">兑换</button>
      </div>
    </div>

    <div class="card">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;">兑换说明</h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
          <span style="width:24px;height:24px;background:var(--primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">1</span>
          <div style="font-size:14px;line-height:1.6;">兑换码通常为 12-16 位字母数字组合</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
          <span style="width:24px;height:24px;background:var(--primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">2</span>
          <div style="font-size:14px;line-height:1.6;">每个兑换码只能使用一次，不可重复使用</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
          <span style="width:24px;height:24px;background:var(--primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">3</span>
          <div style="font-size:14px;line-height:1.6;">兑换成功后余额或套餐将立即到账</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
          <span style="width:24px;height:24px;background:var(--primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">4</span>
          <div style="font-size:14px;line-height:1.6;">如有兑换问题，请提交工单联系客服</div>
        </div>
      </div>
    </div>
  `;
};

MB.doRedeem = function() {
  const code = document.getElementById('redeemCode').value.trim().toUpperCase();
  if (!code) {
    this.toast('请输入兑换码', 'error');
    return;
  }
  this.toast('兑换码验证中...', 'info');
  setTimeout(() => this.toast('兑换码无效或已过期', 'error'), 1200);
};
