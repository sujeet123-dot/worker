const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();

app.set('trust proxy', true);

const gaClient = axios.create({
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 200 }),
    timeout: 10000
});

const TARGET_URL = "https://www.zenithummedia.com/case-studies?utm_source=google&utm_medium=medium&utm_campaign=AK42";
const MEASUREMENT_ID = "G-SNCY0K36MC";

// --- THE MIRROR TRACKER ---
async function sendMirroredPing(ids, eventName, extraParams = {}) {
    const params = new URLSearchParams({
        v: '2',
        tid: MEASUREMENT_ID,
        cid: ids.clientId,
        sid: ids.sessionId,
        uip: ids.userIp,    // Mirror the User's Real IP
        _uip: ids.userIp,   // Double-lock IP override
        dl: TARGET_URL,
        en: eventName,
        cs: 'google', 
        cm: 'medium', 
        cn: 'AK42',
        seg: '1',
        ...extraParams
    });

    try {
        await gaClient.get(`https://www.google-analytics.com/g/collect?${params.toString()}`, {
            headers: { 
                'User-Agent': ids.userAgent, // Mirror the User's User-Agent
                'X-Forwarded-For': ids.userIp 
            }
        });
        console.log(`[MIRROR SYNC] ${eventName} sent for ${ids.clientId}`);
    } catch (e) {
        console.error(`[SYNC ERROR] ${e.message}`);
    }
}

// Dedicated tracking route triggered by the Beacon
app.post('/track-sync', async (req, res) => {
    const { cid, sid, ip, ua } = req.query;
    res.status(204).end();

    const ids = { 
        clientId: cid, 
        sessionId: sid, 
        userIp: ip, 
        userAgent: decodeURIComponent(ua) 
    };

    console.log(`[FINGERPRINT RECEIVED] IP: ${ids.userIp} | UA: ${ids.userAgent.slice(0, 30)}...`);

    // Wait for browser session to settle
    await new Promise(r => setTimeout(r, 20000)); 
    await sendMirroredPing(ids, 'scroll', { 'epn.percent_scrolled': 90, '_et': '20000' });

    await new Promise(r => setTimeout(r, 70000));
    await sendMirroredPing(ids, 'final_session', { '_et': '70000' });
});

// --- HTML BRIDGE ---
app.get('/', (req, res) => {
    // Detect IP on the initial request
    const userIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().replace('::ffff:', '');
    
    // Master IDs
    const clientId = `100.${Math.round(Math.random() * 1000000000)}`;
    const sessionId = Math.round(Date.now() / 1000).toString();

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

                gtag('config', '${MEASUREMENT_ID}', { 
                    'client_id': '${clientId}',
                    'session_id': '${sessionId}',
                    'campaign_source': 'google',
                    'campaign_medium': 'medium',
                    'campaign_name': 'AK42',
                    'send_page_view': false 
                });

                gtag('event', 'page_view', {
                    'event_callback': function() {
                        // Create the Fingerprint Package
                        const fingerprint = new URLSearchParams({
                            cid: '${clientId}',
                            sid: '${sessionId}',
                            ip: '${userIp}',
                            ua: navigator.userAgent
                        });
                        // Send the Fingerprint to the Server
                        navigator.sendBeacon('/track-sync?' + fingerprint.toString());
                        
                        setTimeout(function() {
                            window.location.replace("${TARGET_URL}");
                        }, 400);
                    }
                });
                
                // Safety backup
                setTimeout(function() { window.location.replace("${TARGET_URL}"); }, 1500);
            </script>
        </head>
        <body style="background:#fff; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <div style="text-align:center; font-family:sans-serif; color:#999; font-size:13px;">
                Securely redirecting...
            </div>
        </body>
        </html>
    `);
});

app.listen(3000);