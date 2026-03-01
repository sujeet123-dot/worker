const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const https = require('https');
const app = express();

// 1. Tell Express to trust Render's proxy to get the real User IP
app.set('trust proxy', true);
app.use(cookieParser());

// Connection pooling for high volume
const gaClient = axios.create({
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 }),
    timeout: 10000
});

const TARGET_URL = "https://www.zenithummedia.com/case-studies?utm_source=google&utm_medium=medium&utm_campaign=DEBUG_UPDATED&utm_id=Visit_frame";
const MEASUREMENT_ID = "G-SNCY0K36MC";

function getGaIdentifiers(req) {
    const gaCookie = req.cookies['_ga'] || '';
    const clientId = gaCookie.split('.').slice(-2).join('.') || `100.${Date.now()}`;
    
    const sidKey = `_ga_${MEASUREMENT_ID.slice(2)}`;
    const sessionCookie = req.cookies?.[sidKey] || '';
    const sessionId = sessionCookie.split('.')[2] || Math.round(Date.now() / 1000).toString();
    
    // Get real user IP from Render's headers
    const userIp = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().replace('::ffff:', ''); 
    const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';

    return { clientId, sessionId, userIp, userAgent };
}

async function sendGaPing(ids, eventName, extraParam={}) {     
      

      const params = new URLSearchParams({
        v: '2',
        tid: MEASUREMENT_ID,
        cid: ids.clientId,
        dl: TARGET_URL,
        sid: ids.sessionId,
        uip: ids.userIp,
        _uip: ids.userIp,    // <--- FIXES THE LOCATION (India vs US)
        en: eventName,
        seg: '1',
        _dbg: '1',
        z: Math.floor(Math.random() * 1000000000).toString(),
        ...extraParam 
      });

    try {
        await gaClient.get(`https://www.google-analytics.com/g/collect?${params.toString()}`, {
            headers: { 
                'User-Agent': ids.userAgent,
                'X-Forwarded-For': ids.userIp 
            }
        });
        console.log(`[GA4] ${eventName} sent for IP: ${ids.userIp}`);
    } catch (err) {
        // Silent fail for high volume
    }
}

app.all('/', (req, res) => {
    const ids = getGaIdentifiers(req);

    // 1. Immediate Warm-up (Registers the user in India)
    sendGaPing(ids, 'page_view');

    const scrollDelay = Math.floor(Math.random() * (45000 - 30000 + 1) + 30000);
    setTimeout(() => {
        sendGaPing(ids, 'scroll', {
          // 'ep.page_location': TARGET_URL,
          'epn.percent_scrolled': 90,
          '_et': scrollDelay.toString() // This locks in the 30-45s engagement
        });
    }, scrollDelay);

    // 2. Background Timer (90-100s)
    const randomDuration = Math.floor(Math.random() * (100000 - 90000 + 1) + 90000);
    setTimeout(() => {
        sendGaPing(ids, 'session_duration_finalizedzm');
    }, randomDuration);


    // 3. Instant 307 Redirect
    res.set({
        'Location': TARGET_URL,
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
    });

    res.status(307).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Location-Corrected Scaler active on port ${PORT}`));