/**
 * 迷你兄弟 - 核心JS逻辑 (SaaS后台风格)
 * MB namespace
 */
const MB = {
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

  // ===== 用户系统 =====
  _users: JSON.parse(localStorage.getItem('mb_users') || '{}'),

  getUsers() {
    return this._users;
  },

  saveUsers() {
    localStorage.setItem('mb_users', JSON.stringify(this._users));
  },

  getCurrentUser() {
    const email = localStorage.getItem('mb_current');
    if (!email) return null;
    return this._users[email];
  },

  isLoggedIn() {
    return !!localStorage.getItem('mb_current');
  },

  requireLogin() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  },

  // 登录
  handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
      this.toast('请填写邮箱和密码', 'error');
      return;
    }
    const users = this.getUsers();
    const hash = this.hashPassword(password);
    if (!users[email] || users[email].password !== hash) {
      this.toast('邮箱或密码错误', 'error');
      return;
    }
    localStorage.setItem('mb_current', email);
    this.toast('登录成功！', 'success');
    setTimeout(() => window.location.href = 'dashboard.html', 800);
  },

  // 注册
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
    
    const users = this.getUsers();
    if (users[email]) {
      this.toast('该邮箱已注册', 'error');
      return;
    }
    
    users[email] = {
      email,
      name: email.split('@')[0],
      password: this.hashPassword(password),
      balance: 0,
      withdrawable: 0,
      totalCommission: 0,
      invitedCount: 0,
      inviteCode: 'MB' + email.substring(0, 6).toUpperCase(),
      orders: [],
      subscription: null,
      traffic: { used: 0, total: '0GB' },
      createdAt: new Date().toLocaleDateString('zh-CN')
    };
    this._users = users;
    this.saveUsers();
    localStorage.removeItem('mb_verify_' + email);
    this.toast('注册成功！请登录', 'success');
    setTimeout(() => window.location.href = 'login.html', 1500);
  },

  // Vercel 邮件API
  MAIL_API: 'https://mini-brother-k4mn42p6t-panzaizhangs-projects.vercel.app/api/send-code',

  // 发送注册验证码
  async sendRegisterCode(email) {
    if (!email || !email.includes('@')) {
      this.toast('请输入有效的邮箱', 'error');
      return;
    }
    const users = this.getUsers();
    if (users[email]) {
      this.toast('该邮箱已注册', 'error');
      return;
    }
    
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
  logout() {
    localStorage.removeItem('mb_current');
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
        <div class="card" style="text-align:center;padding:60px;">
          <div style="font-size:64px;margin-bottom:20px;">📡</div>
          <h3 style="font-size:20px;font-weight:700;margin-bottom:8px;">暂无订阅</h3>
          <p style="font-size:14px;color:var(--text-tertiary);margin-bottom:24px;">您还没有购买任何套餐</p>
          <a href="shop.html" class="btn btn-primary">前往商店</a>
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
