const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer'); // NEW: Email service
require('dotenv').config();

console.log('CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? 'Loaded' : 'Missing');
console.log('GMAIL_USER:', process.env.GMAIL_USER ? 'Loaded' : 'Missing');
console.log('PORT:', process.env.PORT || 3000);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));

// Create configs directory if it doesn't exist
const configsDir = path.join(__dirname, 'configs');
if (!fs.existsSync(configsDir)) {
    fs.mkdirSync(configsDir);
}

// Conversation history storage
const conversations = {};

// NEW: Email transporter setup
let emailTransporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    emailTransporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS
        }
    });
    console.log('Email service configured');
} else {
    console.log('Email service not configured (missing credentials)');
}

// NEW: Function to send handoff email
async function sendHandoffEmail(config, conversationHistory, customerContact, operatorId) {
    if (!emailTransporter) {
        console.log('Email service not available');
        return false;
    }

    try {
        const businessName = config.businessName || 'Your Business';
        const customerEmail = customerContact?.email || 'Not provided';
        const customerPhone = customerContact?.phone || 'Not provided';
        
        // Format conversation history
        let conversationText = '';
        conversationHistory.forEach((msg, index) => {
            const role = msg.role === 'user' ? 'Customer' : 'Chatbot';
            conversationText += `${role}: ${msg.content}\n\n`;
        });

        const emailContent = `
🚨 AGENT HANDOFF REQUEST

Business: ${businessName}
Operator ID: ${operatorId}
Time: ${new Date().toLocaleString()}

📞 CUSTOMER CONTACT:
Email: ${customerEmail}
Phone: ${customerPhone}

💬 CONVERSATION HISTORY:
${conversationText}

---
The customer has requested to speak with a human agent. Please reach out to them as soon as possible.

Best regards,
Wherewolf Chatbot System
        `;

        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: process.env.OPERATOR_EMAIL || process.env.GMAIL_USER,
            subject: `🚨 Agent Request: ${businessName} - ${customerEmail}`,
            text: emailContent,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #8B5CF6; color: white; padding: 20px; text-align: center;">
                        <h2>🚨 Agent Handoff Request</h2>
                    </div>
                    <div style="padding: 20px; background: #f9f9f9;">
                        <h3>Business Details</h3>
                        <p><strong>Business:</strong> ${businessName}</p>
                        <p><strong>Operator ID:</strong> ${operatorId}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    <div style="padding: 20px;">
                        <h3>📞 Customer Contact</h3>
                        <p><strong>Email:</strong> <a href="mailto:${customerEmail}">${customerEmail}</a></p>
                        <p><strong>Phone:</strong> <a href="tel:${customerPhone}">${customerPhone}</a></p>
                    </div>
                    <div style="padding: 20px; background: #f9f9f9;">
                        <h3>💬 Conversation History</h3>
                        <pre style="white-space: pre-wrap; background: white; padding: 15px; border-radius: 5px;">${conversationText}</pre>
                    </div>
                    <div style="padding: 20px; text-align: center; background: #8B5CF6; color: white;">
                        <p>Please reach out to the customer as soon as possible!</p>
                    </div>
                </div>
            `
        };

        await emailTransporter.sendMail(mailOptions);
        console.log('Handoff email sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending handoff email:', error);
        return false;
    }
}

// Root route redirect
app.get('/', (req, res) => {
    res.redirect('/setup');
});

// Serve setup page
app.get('/setup', (req, res) => {
    res.sendFile(path.join(__dirname, 'setup.html'));
});

// Serve chat page
app.get('/chat.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// Endpoint to save operator config with dynamic URL
app.post('/api/save-config', (req, res) => {
    console.log('Received config save request:', req.body);
    
    const config = req.body;
    const operatorId = Math.random().toString(36).substring(2, 9); 

    const configFilePath = path.join(configsDir, `${operatorId}.json`);

    try {
        // Save config to file
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`Config saved successfully for operator ${operatorId}`);

        // Dynamic URL generation for different hosting platforms
        const isProduction = process.env.NODE_ENV === 'production';
        const host = isProduction 
            ? (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RENDER_EXTERNAL_HOSTNAME || req.get('host'))
            : `localhost:${process.env.PORT || 3000}`;
        const protocol = isProduction ? 'https' : 'http';
        const baseUrl = `${protocol}://${host}`;

        const embedCode = `<script>
  window.wherewolfChatbot = {
    operatorId: '${operatorId}'
  };
</script>
<script src="${baseUrl}/widget.js"></script>`;

        res.json({
            success: true,
            operatorId,
            embedCode,
            baseUrl // For debugging
        });
    } catch (error) {
        console.error('Error saving config file:', error);
        res.status(500).json({ success: false, error: 'Failed to save configuration.' });
    }
});

// Endpoint to get operator config
app.get('/api/config/:operatorId', (req, res) => {
    const { operatorId } = req.params;
    const configPath = path.join(configsDir, `${operatorId}.json`);

    console.log(`Looking for config at: ${configPath}`);

    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json(config);
        } catch (error) {
            console.error(`Error reading config for ${operatorId}:`, error);
            res.status(500).json({ error: 'Failed to read configuration.' });
        }
    } else {
        console.log(`Config not found for operator: ${operatorId}`);
        res.status(404).json({ error: 'Config not found' });
    }
});

// NEW: Store customer contact info globally
const customerContacts = {};

// Main Chat endpoint with agent handoff
app.post('/api/chat', async function(req, res) {
    const { message, sessionId = 'default', operatorId } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }
    if (!operatorId) {
        return res.status(400).json({ error: "operatorId is required for chat" });
    }

    // Load this operator's config
    let currentConfig;
    try {
        const configPath = path.join(configsDir, `${operatorId}.json`);
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ error: 'Operator config not found.' });
        }
        currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        console.error(`Error loading config for operatorId ${operatorId}:`, error);
        return res.status(500).json({ error: 'Failed to load operator configuration.' });
    }

    // Create unique session ID per operator
    const sessionKey = `${operatorId}_${sessionId}`;
    
    // Initialize conversation history
    if (!conversations[sessionKey]) {
        conversations[sessionKey] = [];
    }
    conversations[sessionKey].push({ role: 'user', content: message });

    const lowerMessage = message.toLowerCase();
    const waiverLink = currentConfig.waiverLink || "No waiver link provided.";

    // NEW: Check for agent/human requests FIRST
    if (
        lowerMessage.includes('agent') ||
        lowerMessage.includes('human') ||
        lowerMessage.includes('speak to someone') ||
        lowerMessage.includes('talk to someone') ||
        lowerMessage.includes('representative') ||
        lowerMessage.includes('person') ||
        lowerMessage.includes('staff') ||
        lowerMessage.includes('manager') ||
        lowerMessage.includes('urgent') ||
        lowerMessage.includes('call me') ||
        lowerMessage.includes('phone call')
    ) {
        // Try to send handoff email
        const customerContact = customerContacts[sessionKey];
        const emailSent = await sendHandoffEmail(currentConfig, conversations[sessionKey], customerContact, operatorId);
        
        let botResponse;
        if (emailSent) {
            botResponse = `I'm connecting you with our team right away! 👥 Someone will reach out within 30 minutes. In the meantime, what's the best way to contact you - the email you provided earlier, or would you prefer a phone call?`;
        } else {
            botResponse = `I'd love to connect you with our team! 👥 Please email us directly at ${process.env.OPERATOR_EMAIL || 'your-email@example.com'} or call us, and we'll help you right away. Include "URGENT" in your subject line for fastest response.`;
        }
        
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        return res.json({ response: botResponse });
    }

    // Check for waiver/form related keywords
    if (
        lowerMessage.includes('waiver') ||
        lowerMessage.includes('form') ||
        lowerMessage.includes('sign') ||
        lowerMessage.includes('release')
    ) {
        const botResponse = `Here's your waiver: <a href='${waiverLink}' target='_blank' style='color: #8B5CF6;'>Click here to sign</a>`;
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        return res.json({ response: botResponse });
    }

    // Create dynamic system prompt with better data handling
    const businessName = currentConfig.businessName || "our tour company";
    const businessType = currentConfig.businessType || "tours";
    const location = currentConfig.location || "our meeting location";
    const duration = currentConfig.duration || "several hours";
    const adultPrice = currentConfig.adultPrice || "contact us for pricing";
    const childPrice = currentConfig.childPrice || "contact us for pricing";
    const groupDiscount = currentConfig.groupDiscount || "ask about group discounts";
    const whatToBring = currentConfig.whatToBring || "sunscreen, camera, and comfortable clothes";
    const cancellationPolicy = currentConfig.cancellationPolicy || "contact us about cancellations";
    const weatherPolicy = currentConfig.weatherPolicy || "contact us about weather policies";
    
    // Handle tour times more carefully
    let tourTimes = "contact us for available times";
    if (currentConfig.times && Array.isArray(currentConfig.times) && currentConfig.times.length > 0) {
        const validTimes = currentConfig.times.filter(time => time && time.trim() !== '');
        if (validTimes.length > 0) {
            tourTimes = validTimes.join(', ');
        }
    }

    const SYSTEM_PROMPT = `You are a friendly chatbot for ${businessName}.
    Give helpful answers in 2-3 SHORT sentences.

    Tour info:
    - Type: ${businessType}
    - Location/Meeting: ${location}
    - Times: ${tourTimes}
    - Duration: ${duration}
    - Price: Adults ${adultPrice}, Kids ${childPrice}
    - Group Discount: ${groupDiscount}
    - What to Bring: ${whatToBring}
    - Cancellation Policy: ${cancellationPolicy}
    - Weather Policy: ${weatherPolicy}

    IMPORTANT: Keep responses to 2-3 short sentences. Be friendly and helpful but concise. Never say "undefined" or "null" - always provide helpful information.

    If someone needs complex help or wants to make a special request, suggest they can "speak to someone from our team" for personalized assistance.`;

    try {
        // Call Claude API
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-haiku-20240307',
            max_tokens: 100,
            temperature: 0.5,
            system: SYSTEM_PROMPT,
            messages: conversations[sessionKey]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        });

        const botResponse = response.data.content[0].text;
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });

        // Trim conversation history
        if (conversations[sessionKey].length > 20) {
            conversations[sessionKey] = conversations[sessionKey].slice(-20);
        }

        res.json({ response: botResponse });

    } catch (error) {
        console.error('Error with Claude API:', error.response?.data || error.message);

        // Improved fallback responses
        let fallbackResponse = "Sorry, I'm having connection issues. For immediate help, please speak to someone from our team!";

        if (lowerMessage.includes('time') || lowerMessage.includes('schedule')) {
            if (currentConfig.times && Array.isArray(currentConfig.times) && currentConfig.times.length > 0) {
                const validTimes = currentConfig.times.filter(time => time && time.trim() !== '');
                if (validTimes.length > 0) {
                    fallbackResponse = `Our tours run at ${validTimes.join(', ')}. Contact us to book!`;
                } else {
                    fallbackResponse = `We offer tours throughout the day. Contact us for current availability!`;
                }
            } else {
                fallbackResponse = `We offer tours throughout the day. Contact us for current availability!`;
            }
        } else if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
            const adult = currentConfig.adultPrice || "contact us for pricing";
            const child = currentConfig.childPrice || "contact us for pricing";
            fallbackResponse = `Adults: ${adult}, Children: ${child}. Contact us for the latest rates!`;
        } else if (lowerMessage.includes('location') || lowerMessage.includes('meet') || lowerMessage.includes('where')) {
            const meetLocation = currentConfig.location || "our marina location";
            fallbackResponse = `We meet at ${meetLocation}. Contact us for exact directions!`;
        } else if (lowerMessage.includes('bring') || lowerMessage.includes('pack')) {
            const toBring = currentConfig.whatToBring || "sunscreen, camera, and comfortable clothes";
            fallbackResponse = `Please bring: ${toBring}. We'll have everything else ready!`;
        }

        res.json({ response: fallbackResponse });
    }
});

// UPDATED: Contact info capture with session storage
app.post('/contact-info', (req, res) => {
    const { email, phone, operatorId, sessionId = 'default' } = req.body;
    const sessionKey = `${operatorId}_${sessionId}`;
    
    // Store customer contact for this session
    customerContacts[sessionKey] = { email, phone };
    
    console.log('📬 Received contact info:', {
        email: email || 'N/A',
        phone: phone || 'N/A',
        session: sessionKey
    });
    res.sendStatus(200);
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is working!',
        timestamp: new Date().toISOString(),
        emailConfigured: !!emailTransporter
    });
});

// Debug endpoint
app.get('/api/debug/:operatorId', (req, res) => {
    const { operatorId } = req.params;
    const configPath = path.join(configsDir, `${operatorId}.json`);

    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json({
                success: true,
                operatorId,
                config,
                emailConfigured: !!emailTransporter,
                timesData: {
                    raw: config.times,
                    isArray: Array.isArray(config.times),
                    length: config.times ? config.times.length : 0,
                    filtered: config.times ? config.times.filter(time => time && time.trim() !== '') : []
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to read config', details: error.message });
        }
    } else {
        res.status(404).json({ error: 'Config not found' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Chatbot server running on port ${PORT}`);
    console.log('📝 Setup page: /setup');
    console.log('💬 Chat interface: /chat.html');
    console.log('🔧 API test: /api/test');
    console.log('📧 Email service:', emailTransporter ? 'Ready' : 'Not configured');
});
