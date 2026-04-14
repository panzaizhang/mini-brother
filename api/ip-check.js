const APIs = [
  {
    // Cloudflare 风格 API，最可靠
    url: 'https://www.cloudflare.com/cdn-cgi/trace',
    timeout: 5000,
    map: (text) => {
      const lines = text.split('\n');
      const data = {};
      lines.forEach(line => {
        const [key, ...value] = line.split('=');
        data[key.trim()] = value.join('=').trim();
      });
      if (!data.ip || data.ip === 'undefined') return null;
      // Cloudflare 不提供国家等信息，只返回 IP
      return {
        ip: data.ip,
        country: data.loc ? data.loc.substring(0, 2) : null,
        countryCode: data.loc ? data.loc.substring(0, 2) : null,
        countryFlag: data.loc === 'CN' ? '🇨🇳' : '',
        city: data.city || null,
        region: data.region || null,
        org: 'Cloudflare CDN',
        asn: null,
        lat: null,
        lon: null,
        timezone: data.timezone || null,
        currency: null,
        isp: 'Cloudflare'
      };
    }
  },
  {
    url: 'https://ipinfo.io/json',
    timeout: 5000,
    map: (data) => {
      if (!data.ip) return null;
      return {
        ip: data.ip,
        country: data.country,
        countryCode: data.country,
        countryFlag: data.country === 'CN' ? '🇨🇳' : '',
        city: data.city,
        region: data.region,
        org: data.org,
        asn: data.org ? null : null,
        lat: data.loc ? parseFloat(data.loc.split(',')[0]) : null,
        lon: data.loc ? parseFloat(data.loc.split(',')[1]) : null,
        timezone: data.timezone,
        currency: null,
        isp: data.org
      };
    }
  },
  {
    url: 'https://ipapi.co/json/',
    timeout: 8000,
    map: (data) => {
      if (!data.ip) return null;
      return {
        ip: data.ip,
        country: data.country_name,
        countryCode: data.country_code,
        countryFlag: data.country_flag || '',
        city: data.city,
        region: data.region,
        org: data.org,
        asn: data.asn ? 'AS' + data.asn : null,
        lat: data.latitude,
        lon: data.longitude,
        timezone: data.timezone,
        currency: data.currency ? data.currency + ' (' + data.currency_name + ')' : null,
        isp: data.org
      };
    }
  },
  {
    url: 'https://ip-api.com/json/?fields=status,message,country,countryCode,city,region,org,as,lat,lon,timezone,currency,currencyName',
    timeout: 8000,
    map: (data) => {
      if (!data.query) return null;
      return {
        ip: data.query,
        country: data.country,
        countryCode: data.countryCode,
        countryFlag: data.countryCode === 'CN' ? '🇨🇳' : '',
        city: data.city,
        region: data.region,
        org: data.org,
        asn: data.as ? 'AS' + data.as : null,
        lat: data.lat,
        lon: data.lon,
        timezone: data.timezone,
        currency: data.currency ? data.currency + ' (' + data.currencyName + ')' : null,
        isp: data.org
      };
    }
  },
  {
    url: 'https://ipwho.is/?fields=ip,country,country_code,city,region,connection,coords,timezone,currency',
    timeout: 8000,
    map: (data) => {
      if (!data.ip) return null;
      const conn = data.connection || {};
      const coords = data.coords || {};
      return {
        ip: data.ip,
        country: data.country,
        countryCode: data.country_code,
        countryFlag: '',
        city: data.city,
        region: data.region,
        org: conn.isp || '',
        asn: conn.asn ? 'AS' + conn.asn : null,
        lat: coords.latitude,
        lon: coords.longitude,
        timezone: data.timezone,
        currency: data.currency ? data.currency : null,
        isp: conn.isp
      };
    }
  }
];

async function tryApi(api) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), api.timeout);
  
  try {
    const response = await fetch(api.url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MiniBrother/1.0)' }
    });
    clearTimeout(timer);
    
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    // Cloudflare 返回纯文本
    if (api.url.includes('cloudflare.com')) {
      const text = await response.text();
      return api.map(text);
    }
    
    const data = await response.json();
    return api.map(data);
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 依次尝试各个 API
  for (const api of APIs) {
    const result = await tryApi(api);
    if (result) {
      return res.status(200).json({
        success: true,
        data: result
      });
    }
  }

  // 所有 API 都失败
  return res.status(200).json({
    success: false,
    error: '所有节点均不可用'
  });
}
