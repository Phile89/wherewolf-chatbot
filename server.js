const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
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

// Email transporter setup
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

// Enhanced function to send handoff email
async function sendHandoffEmail(config, conversationHistory, customerContact, operatorId) {
    if (!emailTransporter) {
        console.log('Email service not available');
        return false;
    }

    try {
        const businessName = config.businessName || 'Your Business';
        const customerEmail = customerContact?.email || 'Not provided';
        const customerPhone = customerContact?.phone || 'Not provided';
        const responseTime = config.responseTime || '30 minutes';
        const contactMethods = config.contactMethods || 'Email, Phone';
        
        // Format conversation history
        let conversationText = '';
        conversationHistory.forEach((msg, index) => {
            const role = msg.role === 'user' ? 'Customer' : 'Chatbot';
            conversationText += `${role}: ${msg.content}\n\n`;
        });

        const emailContent = `
🚨 URGENT: Customer Requesting Human Agent

Business: ${businessName}
Operator ID: ${operatorId}
Time: ${new Date().toLocaleString()}
Expected Response Time: ${responseTime}
Preferred Contact: ${contactMethods}

📞 CUSTOMER CONTACT:
Email: ${customerEmail}
Phone: ${customerPhone}

💬 FULL CONVERSATION:
${conversationText}

⚡ ACTION REQUIRED:
Please contact this customer within ${responseTime} using their preferred method: ${contactMethods}

Best regards,
Wherewolf Enhanced Chatbot System
        `;

        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: process.env.OPERATOR_EMAIL || process.env.GMAIL_USER,
            subject: `🚨 URGENT Agent Request: ${businessName} - ${customerEmail}`,
            text: emailContent,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: ${config.brandColor || '#8B5CF6'}; color: white; padding: 20px; text-align: center;">
                        <h2>🚨 Urgent Agent Request</h2>
                        <p style="margin: 0; font-size: 18px;">${businessName}</p>
                    </div>
                    <div style="padding: 20px; background: #f9f9f9;">
                        <h3>Business Details</h3>
                        <p><strong>Business:</strong> ${businessName}</p>
                        <p><strong>Operator ID:</strong> ${operatorId}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                        <p><strong>Expected Response:</strong> ${responseTime}</p>
                        <p><strong>Contact Methods:</strong> ${contactMethods}</p>
                    </div>
                    <div style="padding: 20px;">
                        <h3>📞 Customer Contact</h3>
                        <p><strong>Email:</strong> <a href="mailto:${customerEmail}">${customerEmail}</a></p>
                        <p><strong>Phone:</strong> <a href="tel:${customerPhone}">${customerPhone}</a></p>
                    </div>
                    <div style="padding: 20px; background: #f9f9f9;">
                        <h3>💬 Conversation History</h3>
                        <pre style="white-space: pre-wrap; background: white; padding: 15px; border-radius: 5px; font-size: 14px;">${conversationText}</pre>
                    </div>
                    <div style="padding: 20px; text-align: center; background: ${config.brandColor || '#8B5CF6'}; color: white;">
                        <h3>⚡ Action Required</h3>
                        <p>Please contact this customer within <strong>${responseTime}</strong></p>
                        <p>Preferred contact method: <strong>${contactMethods}</strong></p>
                    </div>
                </div>
            `
        };

        await emailTransporter.sendMail(mailOptions);
        console.log('Enhanced handoff email sent successfully');
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

// Endpoint to save operator config (enhanced)
app.post('/api/save-config', (req, res) => {
    console.log('Received enhanced config save request:', req.body);
    
    const config = req.body;
    const operatorId = Math.random().toString(36).substring(2, 9); 

    const configFilePath = path.join(configsDir, `${operatorId}.json`);

    try {
        // Save enhanced config to file
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`Enhanced config saved successfully for operator ${operatorId}`);

        // Dynamic URL generation
        const isProduction = process.env.NODE_ENV === 'production';
        const host = isProduction 
            ? (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RENDER_EXTERNAL_HOSTNAME || req.get('host'))
            : `localhost:${process.env.PORT || 3000}`;
        const protocol = isProduction ? 'https' : 'http';
        const baseUrl = `${protocol}://${host}`;

        const embedCode = `<script>
  window.wherewolfChatbot = {
    operatorId: '${operatorId}',
    buttonColor: '${config.brandColor || '#8B5CF6'}'
  };
</script>
<script src="${baseUrl}/widget.js"></script>`;

        res.json({
            success: true,
            operatorId,
            embedCode,
            baseUrl
        });
    } catch (error) {
        console.error('Error saving enhanced config file:', error);
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

// Store customer contact info globally
const customerContacts = {};

// Enhanced function to build system prompt
function buildEnhancedSystemPrompt(config) {
    const businessName = config.businessName || "our tour company";
    const businessType = config.businessType || "tours";
    const location = config.location || "our meeting location";
    const duration = config.duration || "several hours";
    const adultPrice = config.adultPrice || "contact us for pricing";
    const childPrice = config.childPrice || "contact us for pricing";
    const groupDiscount = config.groupDiscount || "ask about group discounts";
    const whatToBring = config.whatToBring || "sunscreen, camera, and comfortable clothes";
    const cancellationPolicy = config.cancellationPolicy || "contact us about cancellations";
    const weatherPolicy = config.weatherPolicy || "contact us about weather policies";
    
    // Enhanced features
    const phoneNumber = config.phoneNumber || "";
    const websiteUrl = config.websiteUrl || "";
    const businessHours = config.businessHours || "during business hours";
    const maxGroupSize = config.maxGroupSize || "";
    const companyTagline = config.companyTagline || "";
    const activityTypes = config.activityTypes || [];
    const difficultyLevel = config.difficultyLevel || "All levels";
    const minAge = config.minAge || "0";
    const maxAge = config.maxAge || "no limit";
    const specialOffers = config.specialOffers || "";
    const bookingLink = config.bookingLink || "";
    const socialMedia = config.socialMedia || "";
    const certifications = config.certifications || "";
    const responseTime = config.responseTime || "30 minutes";
    const contactMethods = config.contactMethods || "email and phone";
    
    // Personality settings
    const tone = config.chatbotTone || "Friendly";
    const languageStyle = config.languageStyle || "Conversational";
    const expertiseLevel = config.expertiseLevel || "Basic information";
    const responseLength = config.responseLength || "Brief (1-2 sentences)";
    
    // Handle tour times more carefully
    let tourTimes = "contact us for available times";
    if (config.times && Array.isArray(config.times) && config.times.length > 0) {
        const validTimes = config.times.filter(time => time && time.trim() !== '');
        if (validTimes.length > 0) {
            tourTimes = validTimes.join(', ');
        }
    }

    // Build personality instructions
    let personalityInstructions = "";
    
    switch (tone) {
        case "Professional":
            personalityInstructions += "Use professional, courteous language. ";
            break;
        case "Casual":
            personalityInstructions += "Use relaxed, informal language. ";
            break;
        case "Enthusiastic":
            personalityInstructions += "Use energetic, excited language with emojis. ";
            break;
        default: // Friendly
            personalityInstructions += "Use warm, welcoming language. ";
    }
    
    switch (responseLength) {
        case "Detailed (3-4 sentences)":
            personalityInstructions += "Provide detailed 3-4 sentence responses. ";
            break;
        case "Moderate (2-3 sentences)":
            personalityInstructions += "Give moderate 2-3 sentence responses. ";
            break;
        default: // Brief
            personalityInstructions += "Keep responses to 1-2 short sentences. ";
    }

    // Build activity info
    let activityInfo = "";
    if (activityTypes.length > 0) {
        activityInfo = `We offer: ${activityTypes.join(', ')}. `;
    }
    
    // Build age restrictions
    let ageInfo = "";
    if (minAge && minAge !== "0") {
        ageInfo += `Minimum age: ${minAge}. `;
    }
    if (maxAge && maxAge !== "0") {
        ageInfo += `Maximum age: ${maxAge}. `;
    }
    if (!ageInfo) {
        ageInfo = "All ages welcome. ";
    }

    // Build special offers info
    let offersInfo = "";
    if (specialOffers) {
        offersInfo = `Current special: ${specialOffers}. `;
    }

    // Build contact info
    let contactInfo = "";
    if (phoneNumber) {
        contactInfo += `Phone: ${phoneNumber}. `;
    }
    if (websiteUrl) {
        contactInfo += `Website: ${websiteUrl}. `;
    }

    const SYSTEM_PROMPT = `You are a ${tone.toLowerCase()} chatbot for ${businessName}${companyTagline ? ` - ${companyTagline}` : ''}.
${personalityInstructions}

BUSINESS INFO:
- Type: ${businessType} (${difficultyLevel} difficulty)
- ${activityInfo}
- Location: ${location}
- Times: ${tourTimes}
- Duration: ${duration}
- ${ageInfo}
- ${maxGroupSize ? `Max group size: ${maxGroupSize}. ` : ''}

PRICING:
- Adults: ${adultPrice}
- Children: ${childPrice}
- ${groupDiscount ? `Group rates: ${groupDiscount}. ` : ''}
- ${offersInfo}

PRACTICAL INFO:
- What to bring: ${whatToBring}
- Cancellation: ${cancellationPolicy}
- Weather policy: ${weatherPolicy}
- ${certifications ? `Safety: ${certifications}. ` : ''}

CONTACT & BOOKING:
- ${contactInfo}
- ${bookingLink ? `Book online: ${bookingLink}. ` : ''}
- ${socialMedia ? `Social: ${socialMedia}. ` : ''}
- Business hours: ${businessHours}
- Response time: ${responseTime}

${expertiseLevel === "Educational focus" ? "Focus on educational aspects and learning opportunities. " : ""}
${expertiseLevel === "Detailed expert knowledge" ? "Provide detailed, expert-level information when asked. " : ""}

IMPORTANT: ${personalityInstructions}Never say "undefined" or "null". Always provide helpful information.

If someone needs complex help or wants to make special requests, suggest they can "speak to someone from our team" for personalized assistance. Our team responds within ${responseTime} via ${contactMethods}.`;

    return SYSTEM_PROMPT;
}

// Enhanced Chat endpoint with agent handoff
app.post('/api/chat', async function(req, res) {
    const { message, sessionId = 'default', operatorId } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }
    if (!operatorId) {
        return res.status(400).json({ error: "operatorId is required for chat" });
    }

    // Load this operator's enhanced config
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

    // Enhanced agent/human detection with custom triggers
    const defaultAgentKeywords = [
        'agent', 'human', 'speak to someone', 'talk to someone', 
        'representative', 'person', 'staff', 'manager', 'urgent'
    ];
    
    // Add custom handoff triggers from config
    let customTriggers = [];
    if (currentConfig.handoffTriggers) {
        customTriggers = currentConfig.handoffTriggers.split(',').map(t => t.trim().toLowerCase());
    }
    
    const allAgentKeywords = [...defaultAgentKeywords, ...customTriggers];

    const isAgentRequest = allAgentKeywords.some(keyword => lowerMessage.includes(keyword)) ||
        lowerMessage.includes('call me') ||
        (lowerMessage.includes('phone') && lowerMessage.includes('call') && lowerMessage.length < 20);

    // Track if agent handoff already happened for this session
    const handoffKey = `handoff_${sessionKey}`;
    const alreadyHandedOff = conversations[handoffKey] || false;

    if (isAgentRequest && !alreadyHandedOff) {
        // Mark this conversation as already handed off
        conversations[handoffKey] = true;
        
        // Try to send handoff email
        const customerContact = customerContacts[sessionKey];
        const emailSent = await sendHandoffEmail(currentConfig, conversations[sessionKey], customerContact, operatorId);
        
        const responseTime = currentConfig.responseTime || "30 minutes";
        const contactMethods = currentConfig.contactMethods || "email and phone";
        
        let botResponse;
        if (emailSent) {
            botResponse = `I'm connecting you with our team right away! 👥 Someone will reach out within ${responseTime} via ${contactMethods}. How would you prefer to be contacted?`;
        } else {
            const fallbackEmail = process.env.OPERATOR_EMAIL || currentConfig.phoneNumber || 'your-email@example.com';
            botResponse = `I'd love to connect you with our team! 👥 Please contact us directly at ${fallbackEmail}${currentConfig.phoneNumber ? ` or ${currentConfig.phoneNumber}` : ''}, and we'll help you right away. Include "URGENT" for fastest response.`;
        }
        
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        return res.json({ response: botResponse });
    }

    // If agent already requested, handle follow-up responses about contact preferences
    if (alreadyHandedOff && (lowerMessage.includes('phone') || lowerMessage.includes('email') || lowerMessage.includes('call'))) {
        const responseTime = currentConfig.responseTime || "30 minutes";
        const preferredMethod = lowerMessage.includes('phone') || lowerMessage.includes('call') ? 'phone' : 'email';
        const botResponse = `Perfect! Our team has been notified and will contact you via ${preferredMethod} within ${responseTime}. Is there anything else I can help you with while you wait?`;
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
        const botResponse = `Here's your waiver: <a href='${waiverLink}' target='_blank' style='color: ${currentConfig.brandColor || '#8B5CF6'};'>Click here to sign</a>`;
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        return res.json({ response: botResponse });
    }

    // Check for booking requests
    if (currentConfig.bookingLink && (lowerMessage.includes('book') || lowerMessage.includes('reserve') || lowerMessage.includes('schedule'))) {
        const botResponse = `Ready to book? <a href='${currentConfig.bookingLink}' target='_blank' style='color: ${currentConfig.brandColor || '#8B5CF6'};'>Click here to book online</a> or speak to someone from our team for assistance!`;
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        return res.json({ response: botResponse });
    }

    // Build enhanced system prompt
    const SYSTEM_PROMPT = buildEnhancedSystemPrompt(currentConfig);

    try {
        // Determine max tokens based on response length preference
        let maxTokens = 100;
        switch (currentConfig.responseLength) {
            case "Detailed (3-4 sentences)":
                maxTokens = 150;
                break;
            case "Moderate (2-3 sentences)":
                maxTokens = 120;
                break;
            default:
                maxTokens = 100;
        }

        // Call Claude API with enhanced prompt
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-haiku-20240307',
            max_tokens: maxTokens,
            temperature: currentConfig.chatbotTone === 'Enthusiastic' ? 0.7 : 0.5,
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

        // Enhanced fallback responses using config data
        let fallbackResponse = `Sorry, I'm having connection issues. For immediate help, please speak to someone from our team! ${currentConfig.contactMethods ? `Contact us via ${currentConfig.contactMethods}` : ''}`;

        if (lowerMessage.includes('time') || lowerMessage.includes('schedule')) {
            if (currentConfig.times && Array.isArray(currentConfig.times) && currentConfig.times.length > 0) {
                const validTimes = currentConfig.times.filter(time => time && time.trim() !== '');
                if (validTimes.length > 0) {
                    fallbackResponse = `Our ${currentConfig.businessType || 'tours'} run at ${validTimes.join(', ')}. ${currentConfig.bookingLink ? 'Book online or contact' : 'Contact'} us to reserve!`;
                } else {
                    fallbackResponse = `We offer ${currentConfig.businessType || 'tours'} throughout the day. Contact us for current availability!`;
                }
            }
        } else if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
            const adult = currentConfig.adultPrice || "contact us for pricing";
            const child = currentConfig.childPrice || "contact us for pricing";
            fallbackResponse = `Adults: ${adult}, Children: ${child}. ${currentConfig.specialOffers ? `Special offer: ${currentConfig.specialOffers}. ` : ''}Contact us for the latest rates!`;
        } else if (lowerMessage.includes('location') || lowerMessage.includes('meet') || lowerMessage.includes('where')) {
            const meetLocation = currentConfig.location || "our location";
            fallbackResponse = `We meet at ${meetLocation}. ${currentConfig.phoneNumber ? `Call ${currentConfig.phoneNumber} for` : 'Contact us for'} exact directions!`;
        }

        res.json({ response: fallbackResponse });
    }
});

// Contact info capture with session storage
app.post('/contact-info', (req, res) => {
    const { email, phone, operatorId, sessionId = 'default' } = req.body;
    const sessionKey = `${operatorId}_${sessionId}`;
    
    // Store customer contact for this session
    customerContacts[sessionKey] = { email, phone };
    
    console.log('📬 Received enhanced contact info:', {
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
        message: 'Enhanced server is working!',
        timestamp: new Date().toISOString(),
        emailConfigured: !!emailTransporter,
        version: 'Enhanced v2.0'
    });
});

// Enhanced debug endpoint
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
                enhancedFeatures: {
                    activityTypes: config.activityTypes || [],
                    brandColor: config.brandColor || '#8B5CF6',
                    chatbotPersonality: {
                        tone: config.chatbotTone,
                        responseLength: config.responseLength,
                        languageStyle: config.languageStyle
                    },
                    businessDetails: {
                        phoneNumber: config.phoneNumber,
                        websiteUrl: config.websiteUrl,
                        maxGroupSize: config.maxGroupSize
                    }
                },
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
    console.log(`\n🚀 Enhanced Chatbot server running on port ${PORT}`);
    console.log('📝 Enhanced setup page: /setup');
    console.log('💬 Chat interface: /chat.html');
    console.log('🔧 API test: /api/test');
    console.log('📧 Email service:', emailTransporter ? 'Ready' : 'Not configured');
    console.log('✨ Enhanced features: Brand colors, Personality, Advanced configs');
});
