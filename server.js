const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? 'Loaded' : 'Missing');
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

// Root route redirect
app.get('/', (req, res) => {
    res.redirect('/setup');
});
// Root route redirect
app.get('/', (req, res) => {
    res.redirect('/setup');
});

// ADD THESE ROUTES:
app.get('/setup', (req, res) => {
    res.sendFile(path.join(__dirname, 'setup.html'));
});

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

// Main Chat endpoint
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

    // Check for waiver/form related keywords first
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

    IMPORTANT: Keep responses to 2-3 short sentences. Be friendly and helpful but concise. Never say "undefined" or "null" - always provide helpful information.`;

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
        let fallbackResponse = "Sorry, I'm having connection issues. Please contact us directly for assistance!";

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

// Contact info capture
app.post('/contact-info', (req, res) => {
    const { email, phone } = req.body;
    console.log('📬 Received contact info:', {
        email: email || 'N/A',
        phone: phone || 'N/A'
    });
    res.sendStatus(200);
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is working!',
        timestamp: new Date().toISOString()
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
});
