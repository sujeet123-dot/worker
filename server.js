const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const https = require('https');
const app = express();

app.set('trust proxy', true);
app.use(cookieParser());

const gaClient = axios.create({
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 200 }),
    timeout: 10000
});

const TARGET_URL = "https://www.zenithummedia.com/case-studies?utm_source=google&utm_medium=medium&utm_campaign=SHUBHAMPANDEY&utm_id=Visit_frame";
const MEASUREMENT_ID = "G-SNCY0K36MC";


async function runServerSideTracking(ids) {
    // A. Middle Event (Scroll) - Fires at 30-45s
    const scrollDelay = Math.floor(Math.random() * (45000 - 30000 + 1) + 30000);
    setTimeout(async () => {
        await sendPing(ids, 'scroll', {
            'epn.percent_scrolled': 90,
            '_et': scrollDelay.toString() // Records 30-45s of active engagement
        });
    }, scrollDelay);

    // B. Final Event (Keep-Alive) - Fires at 90-100s
    const totalDelay = Math.floor(Math.random() * (100000 - 90000 + 1) + 90000);
    setTimeout(async () => {
        await sendPing(ids, 'session_keep_alive'); // Extends session duration to 95s+
    }, totalDelay);
}

async function sendPing(ids, eventName, extraParams = {}) {
    const params = new URLSearchParams({
        v: '2', 
        tid: MEASUREMENT_ID, 
        cid: ids.clientId, 
        sid: ids.sessionId,
        uip: ids.userIp, 
        _uip: ids.userIp, 
        dl: TARGET_URL, 
        en: eventName,
        seg: '1', 
        _dbg: '1', 
        ...extraParams
    });
    try {
        await gaClient.get(`https://www.google-analytics.com/g/collect?${params.toString()}`, {
            headers: { 
                'User-Agent': ids.userAgent, 
                'X-Forwarded-For': ids.userIp 
            }
        });
    } catch (e) {}
}


app.all('/', (req, res) => {
    const userIp = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';

    const gaCookie = req.cookies['_ga'] || '';
    const clientId = gaCookie.split('.').slice(-2).join('.') || `100.${Date.now()}`;
    
    const sidKey = `_ga_${MEASUREMENT_ID.slice(2)}`;
    const sessionCookie = req.cookies?.[sidKey] || '';
    const sessionId = sessionCookie.split('.')[2] || Math.round(Date.now() / 1000).toString();
    
    // We don't have cookies yet because the browser hasn't hit us.
    // We generate temporary IDs to pass to the server worker.
    const ids = {
        clientId: clientId,
        sessionId: sessionId,
        userIp,
        userAgent
    };

    // Start server-side pings in background
    runServerSideTracking(ids);

    // Send the "Anchor" page to the user
    const html = (`
        <html>
        <head>
            <script async src="https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"></script>
            <script>
                window.dataLayer = window.dataLayer  [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                // This call in the browser FIXES the location to India
                gtag('config', '${MEASUREMENT_ID}', { 
                    'client_id': '${ids.clientId}',
                    'session_id': '${ids.sessionId}',
                    'page_location': '${TARGET_URL}',
                    'debug_mode': true 
                });
            </script>
        </head>
        <body style="background:#000; color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
            <div>Redirecting to Case Studies...</div>
            <script>
                setTimeout(function(){ window.location.href = "${TARGET_URL}"; }, 600);
            </script>
        </body>
        </html>
    `);
    res.send(html);
});