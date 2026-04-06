const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();

app.set('trust proxy', true);

const gaClient = axios.create({
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 200 }),
    timeout: 10000
});

const TARGET_URL = "https://www.zenithummedia.com/case-studies?utm_source=google&utm_medium=medium&utm_campaign=ZM40";

const MEASUREMENT_ID = "G-SNCY0K36MC";

// --- VALIDATION LOG: VERIFIES ATTRIBUTION DATA BEFORE SENDING ---
function debugValidation(eventName, params) {
    console.log(`[VALIDATING PING: ${eventName}]`);
    console.log(`- Session ID: ${params.get('sid')}`);
    console.log(`- Source/Medium: ${params.get('cs')} / ${params.get('cm')}`);
    console.log(`- Campaign: ${params.get('cn')}`);
}

async function sendMirroredPing(ids, eventName, extraParams = {}) {
    const params = new URLSearchParams({
        v: '2',
        tid: MEASUREMENT_ID,
        cid: ids.clientId,
        sid: ids.sessionId,
        uip: ids.userIp,
        _uip: ids.userIp,
        dl: TARGET_URL,
        dr: 'https://www.google.com/',
        en: eventName,
        cs: 'google', 
        cm: 'medium', 
        cn: 'ZM40',
        seg: '1',
        ...extraParams
    });

    debugValidation(eventName, params);

    try {
        await gaClient.get(`https://www.google-analytics.com/g/collect?${params.toString()}`, {
            headers: { 
                'User-Agent': ids.userAgent,
                'X-Forwarded-For': ids.userIp 
            }
        });
        console.log(`[MIRROR SUCCESS] ${eventName} stitched for ${ids.clientId}`);
    } catch (e) {
        console.error(`[SYNC ERROR] ${e.message}`);
    }
}

// --- SERVER SIDE: STAGED ENGAGEMENT ---
app.post('/track-sync', async (req, res) => {
    const { cid, sid, ip, ua } = req.query;
    res.status(204).end();

    const ids = { clientId: cid, sessionId: sid, userIp: ip, userAgent: decodeURIComponent(ua) };
    console.log(`[SYNC STARTED] CID: ${cid} | SID: ${sid}`);

    // Stage 1: Late Page View (12s Delay)
    await new Promise(r => setTimeout(r, 12000)); 
    await sendMirroredPing(ids, 'page_view', { 
        'page_location': TARGET_URL,
        '_et': '12000',
        '_ss': '1',
        'campaign_source': 'google',
        'campaign_medium': 'medium',
        'campaign_name': 'ZM40',
    });

    // Stage 2: Scroll (30s Total Delay)
    await new Promise(r => setTimeout(r, 18000)); 
    await sendMirroredPing(ids, 'scroll', { 
        'epn.percent_scrolled': 90, 
        '_et': '18000',
        'campaign_source': 'google',
        'campaign_medium': 'medium',
        'campaign_name': 'ZM40',
    });

    // Stage 3: Final Session Hit (90s Total Delay)
    await new Promise(r => setTimeout(r, 82410)); 
    await sendMirroredPing(ids, 'final_session', { 
        '_et': '82410',
        'campaign_source': 'google',
        'campaign_medium': 'medium',
        'campaign_name': 'ZM40',
    });
});

// --- HTML BRIDGE: THE IDENTITY MASTER ---
app.get('/', (req, res) => {
    const userIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().replace('::ffff:', '');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="referrer" content="no-referrer">
            <script async src="https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"></script>
            <script>
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());

                // Persistent CID Logic
                function getCookie(name) {
                    const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
                    return v ? v[2] : null;
                }
                let clientId = getCookie('custom_cid');
                if (!clientId) {
                    clientId = '100.' + Math.round(Math.random() * 1000000000);
                    document.cookie = "custom_cid=" + clientId + "; path=/; max-age=31536000";
                }

                const sessionId = Math.round(Date.now() / 1000).toString();
                gtag('config', '${MEASUREMENT_ID}', { 
                    'client_id': clientId,
                    'session_id': sessionId,
                    'campaign_source': 'google',
                    'campaign_medium': 'medium',
                    'campaign_name': 'ZM40',
                    'send_page_view': false,
                    'ignore_referrer': true 
                });

                gtag('event', 'page_view', {
                    'page_location': '${TARGET_URL}',
                    'source': 'google',
                    'medium': 'medium',
                    'campaign': 'ZM40',
                    'event_callback': function() {
                        const fp = new URLSearchParams({cid: clientId, sid: sessionId, ip: '${userIp}', ua: navigator.userAgent});
                        navigator.sendBeacon('/track-sync?' + fp.toString());
                        setTimeout(() => window.location.replace("${TARGET_URL}"), 400);
                    }
                });
                setTimeout(() => window.location.replace("${TARGET_URL}"), 1500);
            </script>
        </head>
        <body style="background:#fff; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; font-family:sans-serif;">
            <div style="color:#999; font-size:13px;">Securely redirecting...</div>
        </body>
        </html>
    `);
});

app.listen(3000, () => console.log('Staged Engagement Scaler Active'));