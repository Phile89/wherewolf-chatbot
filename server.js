const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
require('dotenv').config();

console.log('CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? 'Loaded' : 'Missing');
console.log('GMAIL_USER:', process.env.GMAIL_USER ? 'Loaded' : 'Missing');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Loaded' : 'Missing');
console.log('PORT:', process.env.PORT || 3000);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initializeDatabase() {
    try {
        // Operator configs table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS operator_configs (
                operator_id VARCHAR(10) PRIMARY KEY,
                config JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Conversations table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                conversation_id SERIAL PRIMARY KEY,
                operator_id VARCHAR(10) REFERENCES operator_configs(operator_id),
                session_key VARCHAR(50) UNIQUE NOT NULL,
                customer_email VARCHAR(255),
                customer_phone VARCHAR(50),
                started_at TIMESTAMP DEFAULT NOW(),
                last_message_at TIMESTAMP DEFAULT NOW(),
                message_count INTEGER DEFAULT 0,
                agent_requested BOOLEAN DEFAULT FALSE
            )
        `);

        // Messages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                message_id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES conversations(conversation_id),
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT NOW()
            )
        `);

        console.log('✅ Database tables initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// Initialize database on startup
initializeDatabase();

// In-memory conversation history for immediate responses (kept for compatibility)
const conversations = {};

// Email transporter setup
let emailTransporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    emailTransporter = nodemailer.createTransport({
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

// Database functions for conversations
async function getOrCreateConversation(operatorId, sessionKey) {
    try {
        // Check if conversation exists
        let result = await pool.query(
            'SELECT conversation_id, customer_email, customer_phone FROM conversations WHERE session_key = $1',
            [sessionKey]
        );

        if (result.rows.length > 0) {
            return result.rows[0];
        }

        // Create new conversation
        result = await pool.query(
            'INSERT INTO conversations (operator_id, session_key) VALUES ($1, $2) RETURNING conversation_id, customer_email, customer_phone',
            [operatorId, sessionKey]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error managing conversation:', error);
        return null;
    }
}

async function saveMessage(conversationId, role, content) {
    try {
        await pool.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversationId, role, content]
        );

        // Update conversation last_message_at and message_count
        await pool.query(
            'UPDATE conversations SET last_message_at = NOW(), message_count = message_count + 1 WHERE conversation_id = $1',
            [conversationId]
        );

        console.log(`💬 Message saved: ${role} in conversation ${conversationId}`);
    } catch (error) {
        console.error('Error saving message:', error);
    }
}

async function updateCustomerContact(sessionKey, email = null, phone = null) {
    try {
        const updateFields = [];
        const values = [];
        let valueIndex = 1;

        if (email) {
            updateFields.push(`customer_email = $${valueIndex}`);
            values.push(email);
            valueIndex++;
        }

        if (phone) {
            updateFields.push(`customer_phone = $${valueIndex}`);
            values.push(phone);
            valueIndex++;
        }

        if (updateFields.length > 0) {
            values.push(sessionKey);
            await pool.query(
                `UPDATE conversations SET ${updateFields.join(', ')} WHERE session_key = $${valueIndex}`,
                values
            );
            console.log(`📧 Customer contact updated for ${sessionKey}`);
        }
    } catch (error) {
        console.error('Error updating customer contact:', error);
    }
}

async function markAgentRequested(sessionKey) {
    try {
        await pool.query(
            'UPDATE conversations SET agent_requested = TRUE WHERE session_key = $1',
            [sessionKey]
        );
        console.log(`🚨 Agent requested marked for ${sessionKey}`);
    } catch (error) {
        console.error('Error marking agent requested:', error);
    }
}

// Enhanced function to send handoff email
async function sendHandoffEmail(config, conversationHistory, customerContact, operatorId) {
    if (!emailTransporter) {
        console.log('Email service not available - no transporter configured');
        return false;
    }

    try {
        const businessName = config.businessName || 'Your Business';
        const customerEmail = customerContact?.email || 'Not provided';
        const customerPhone = customerContact?.phone || 'Not provided';
        const responseTime = config.responseTime || '30 minutes';
        const contactMethods = config.contactMethods || 'Email, Phone';
        
        console.log(`🚨 Sending handoff email for ${businessName} (${operatorId})`);
        console.log(`📧 Customer contact: ${customerEmail} / ${customerPhone}`);
        
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

        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Enhanced handoff email sent successfully:', info.messageId);
        console.log(`📬 Sent to: ${process.env.OPERATOR_EMAIL || process.env.GMAIL_USER}`);
        return true;
    } catch (error) {
        console.error('❌ Error sending handoff email:', error);
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

// Serve dashboard page
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Database function to save operator config
async function saveOperatorConfig(operatorId, config) {
    try {
        await pool.query(
            `INSERT INTO operator_configs (operator_id, config, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (operator_id) 
             DO UPDATE SET config = $2, updated_at = NOW()`,
            [operatorId, JSON.stringify(config)]
        );
        console.log(`✅ Config saved to database for operator ${operatorId}`);
        return true;
    } catch (error) {
        console.error('❌ Database save error:', error);
        return false;
    }
}

// Database function to get operator config
async function getOperatorConfig(operatorId) {
    try {
        const result = await pool.query(
            'SELECT config FROM operator_configs WHERE operator_id = $1',
            [operatorId]
        );
        
        if (result.rows.length > 0) {
            console.log(`✅ Config loaded from database for operator ${operatorId}`);
            return result.rows[0].config;
        } else {
            console.log(`❌ Config not found in database for operator ${operatorId}`);
            return null;
        }
    } catch (error) {
        console.error('❌ Database read error:', error);
        return null;
    }
}

// Dashboard API - Get all conversations
app.get('/api/dashboard/conversations', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.conversation_id,
                c.operator_id,
                c.customer_email,
                c.customer_phone,
                c.started_at,
                c.last_message_at,
                c.message_count,
                c.agent_requested,
                oc.config->>'businessName' as business_name
            FROM conversations c
            LEFT JOIN operator_configs oc ON c.operator_id = oc.operator_id
            ORDER BY c.last_message_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            conversations: result.rows
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Dashboard API - Get messages for a conversation
app.get('/api/dashboard/conversation/:conversationId/messages', async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        const result = await pool.query(`
            SELECT 
                message_id,
                role,
                content,
                timestamp
            FROM messages 
            WHERE conversation_id = $1 
            ORDER BY timestamp ASC
        `, [conversationId]);

        res.json({
            success: true,
            messages: result.rows
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Dashboard API - Get stats
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_conversations,
                COUNT(*) FILTER (WHERE agent_requested = true) as agent_requests,
                COUNT(*) FILTER (WHERE customer_email IS NOT NULL) as with_email,
                COUNT(DISTINCT operator_id) as active_operators
            FROM conversations 
            WHERE started_at >= NOW() - INTERVAL '7 days'
        `);

        const recentMessages = await pool.query(`
            SELECT COUNT(*) as total_messages
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.conversation_id
            WHERE m.timestamp >= NOW() - INTERVAL '24 hours'
        `);

        res.json({
            success: true,
            stats: {
                ...stats.rows[0],
                recent_messages: recentMessages.rows[0].total_messages
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Endpoint to save operator config (with database)
app.post('/api/save-config', async (req, res) => {
    console.log('Received enhanced config save request:', req.body);
    
    const config = req.body;
    const operatorId = Math.random().toString(36).substring(2, 9); 

    try {
        const saved = await saveOperatorConfig(operatorId, config);
        
        if (!saved) {
            return res.status(500).json({ success: false, error: 'Failed to save configuration to database.' });
        }

        console.log(`Enhanced config saved successfully for operator ${operatorId}`);

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
        console.error('Error saving enhanced config:', error);
        res.status(500).json({ success: false, error: 'Failed to save configuration.' });
    }
});

// Endpoint to get operator config (from database)
app.get('/api/config/:operatorId', async (req, res) => {
    const { operatorId } = req.params;
    console.log(`Looking for config in database for operator: ${operatorId}`);

    try {
        const config = await getOperatorConfig(operatorId);
        
        if (config) {
            res.json(config);
        } else {
            console.log(`Config not found for operator: ${operatorId}`);
            res.status(404).json({ error: 'Config not found' });
        }
    } catch (error) {
        console.error(`Error reading config for ${operatorId}:`, error);
        res.status(500).json({ error: 'Failed to read configuration.' });
    }
});

// Store customer contact info globally (kept for compatibility)
const customerContacts = {};

// Enhanced system prompt builder (keeping existing logic)
function buildEnhancedSystemPrompt(config) {
    // [Previous system prompt building logic - keeping it exactly the same]
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
    
    const tone = config.chatbotTone || "Friendly";
    const languageStyle = config.languageStyle || "Conversational";
    const expertiseLevel = config.expertiseLevel || "Basic information";
    const responseLength = config.responseLength || "Brief (1-2 sentences)";
    
    let tourTimes = "contact us for available times";
    if (config.times && Array.isArray(config.times) && config.times.length > 0) {
        const validTimes = config.times.filter(time => time && time.trim() !== '');
        if (validTimes.length > 0) {
            tourTimes = validTimes.join(', ');
        }
    }

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
        default:
            personalityInstructions += "Use warm, welcoming language. ";
    }
    
    switch (responseLength) {
        case "Detailed (3-4 sentences)":
            personalityInstructions += "Provide detailed 3-4 sentence responses. ";
            break;
        case "Moderate (2-3 sentences)":
            personalityInstructions += "Give moderate 2-3 sentence responses. ";
            break;
        default:
            personalityInstructions += "Keep responses to 1-2 short sentences. ";
    }

    let activityInfo = "";
    if (activityTypes.length > 0) {
        activityInfo = `We offer: ${activityTypes.join(', ')}. `;
    }
    
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

    let offersInfo = "";
    if (specialOffers) {
        offersInfo = `Current special: ${specialOffers}. `;
    }

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

${bookingLink ? 
`PRICING & BOOKING:
- For pricing and reservations, direct customers to: ${bookingLink}
- Do not provide specific prices - always refer to booking system for current rates
- Say "For current pricing and availability, please check our booking system" for pricing questions
` : 
`PRICING:
- Adults: ${adultPrice}
- Children: ${childPrice}
- ${groupDiscount ? `Group rates: ${groupDiscount}. ` : ''}
- ${offersInfo}`
}

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

For cancellation requests, explain the policy but tell customers to "speak to someone from our team" to process actual cancellations. Never assume you know booking details or timing.

If someone needs complex help or wants to make special requests, suggest they can "speak to someone from our team" for personalized assistance. Our team responds within ${responseTime} via ${contactMethods}.`;

    return SYSTEM_PROMPT;
}

// Enhanced Chat endpoint with database logging
app.post('/api/chat', async function(req, res) {
    const { message, sessionId = 'default', operatorId } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }
    if (!operatorId) {
        return res.status(400).json({ error: "operatorId is required for chat" });
    }

    const sessionKey = `${operatorId}_${sessionId}`;

    // Get or create conversation in database
    const conversation = await getOrCreateConversation(operatorId, sessionKey);
    if (!conversation) {
        return res.status(500).json({ error: 'Failed to manage conversation' });
    }

    // Save user message to database
    await saveMessage(conversation.conversation_id, 'user', message);

    // Load operator config
    let currentConfig;
    try {
        currentConfig = await getOperatorConfig(operatorId);
        if (!currentConfig) {
            return res.status(404).json({ error: 'Operator config not found.' });
        }
    } catch (error) {
        console.error(`Error loading config for operatorId ${operatorId}:`, error);
        return res.status(500).json({ error: 'Failed to load operator configuration.' });
    }

    // Initialize in-memory conversation for Claude API
    if (!conversations[sessionKey]) {
        conversations[sessionKey] = [];
    }
    conversations[sessionKey].push({ role: 'user', content: message });

    const lowerMessage = message.toLowerCase();
    const waiverLink = currentConfig.waiverLink || "No waiver link provided.";

    // Agent request detection
    const defaultAgentKeywords = [
        'agent', 'human', 'speak to someone', 'talk to someone', 
        'representative', 'person', 'staff', 'manager', 'urgent'
    ];
    
    let customTriggers = [];
    if (currentConfig.handoffTriggers) {
        customTriggers = currentConfig.handoffTriggers.split(',').map(t => t.trim().toLowerCase());
    }
    
    const allAgentKeywords = [...defaultAgentKeywords, ...customTriggers];
    const isAgentRequest = allAgentKeywords.some(keyword => lowerMessage.includes(keyword)) ||
        lowerMessage.includes('call me') ||
        (lowerMessage.includes('phone') && lowerMessage.includes('call') && lowerMessage.length < 20);

    const handoffKey = `handoff_${sessionKey}`;
    const alreadyHandedOff = conversations[handoffKey] || false;

    if (isAgentRequest && !alreadyHandedOff) {
        conversations[handoffKey] = true;
        await markAgentRequested(sessionKey);
        
        const customerContact = customerContacts[sessionKey];
        const responseTime = currentConfig.responseTime || "30 minutes";
        
        let botResponse;
        
        if (customerContact && (customerContact.email || customerContact.phone)) {
            if (emailTransporter) {
                await sendHandoffEmail(currentConfig, conversations[sessionKey], customerContact, operatorId);
            }
            botResponse = `I'm connecting you with our team right away! 👥 Someone will reach out within ${responseTime}. How would you prefer to be contacted?`;
        } else {
            botResponse = `I'd love to connect you with our team! 👥 First, I'll need your contact information. What's your email address so our team can reach out within ${responseTime}?`;
        }
        
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        await saveMessage(conversation.conversation_id, 'assistant', botResponse);
        return res.json({ response: botResponse });
    }

    // Handle agent handoff follow-ups (keeping existing logic)
    if (alreadyHandedOff) {
        const customerContact = customerContacts[sessionKey];
        const responseTime = currentConfig.responseTime || "30 minutes";
        
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\(\d{3}\)\s?\d{3}[-.]?\d{4}\b/;
        
        if (emailRegex.test(message)) {
            const email = message.match(emailRegex)[0];
            customerContacts[sessionKey] = { ...customerContacts[sessionKey], email };
            await updateCustomerContact(sessionKey, email, null);
            
            if (emailTransporter) {
                await sendHandoffEmail(currentConfig, conversations[sessionKey], { email }, operatorId);
            }
            
            const botResponse = `Perfect! I've saved your email (${email}) and our team has been notified. They'll reach out within ${responseTime}. Is there anything else I can help you with while you wait?`;
            conversations[sessionKey].push({ role: 'assistant', content: botResponse });
            await saveMessage(conversation.conversation_id, 'assistant', botResponse);
            return res.json({ response: botResponse });
        } else if (phoneRegex.test(message)) {
            const phone = message.match(phoneRegex)[0];
            customerContacts[sessionKey] = { ...customerContacts[sessionKey], phone };
            await updateCustomerContact(sessionKey, null, phone);
            
            if (emailTransporter) {
                await sendHandoffEmail(currentConfig, conversations[sessionKey], { phone }, operatorId);
            }
            
            const botResponse = `Perfect! I've saved your phone number (${phone}) and our team has been notified. They'll call you within ${responseTime}. Is there anything else I can help you with while you wait?`;
            conversations[sessionKey].push({ role: 'assistant', content: botResponse });
            await saveMessage(conversation.conversation_id, 'assistant', botResponse);
            return res.json({ response: botResponse });
        } else if (lowerMessage.includes('phone') || lowerMessage.includes('call')) {
            if (customerContact && customerContact.phone) {
                const botResponse = `Perfect! Our team will call you at ${customerContact.phone} within ${responseTime}. Is there anything else I can help you with while you wait?`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ response: botResponse });
            } else {
                const botResponse = `Perfect! What's your phone number so our team can call you within ${responseTime}?`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ response: botResponse });
            }
        } else if (lowerMessage.includes('email')) {
            if (customerContact && customerContact.email) {
                const botResponse = `Perfect! Our team will email you at ${customerContact.email} within ${responseTime}. Is there anything else I can help you with while you wait?`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ response: botResponse });
            } else {
                const botResponse = `Perfect! What's your email address so our team can reach out within ${responseTime}?`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ response: botResponse });
            }
        } else if (isAgentRequest) {
            const botResponse = `Our team has already been notified and will reach out within ${responseTime}! Is there anything else I can help you with while you wait, or would you like me to provide our direct contact information?`;
            conversations[sessionKey].push({ role: 'assistant', content: botResponse });
            await saveMessage(conversation.conversation_id, 'assistant', botResponse);
            return res.json({ response: botResponse });
        }
    }

    // Handle waiver requests
    if (lowerMessage.includes('waiver') || lowerMessage.includes('form') || lowerMessage.includes('sign') || lowerMessage.includes('release')) {
        const botResponse = `Here's your waiver: <a href='${waiverLink}' target='_blank' style='color: ${currentConfig.brandColor || '#8B5CF6'};'>Click here to sign</a>`;
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        await saveMessage(conversation.conversation_id, 'assistant', botResponse);
        return res.json({ response: botResponse });
    }

    // Handle pricing questions
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('pricing')) {
        if (currentConfig.bookingLink) {
            const botResponse = `For current pricing and availability, please check our booking system: <a href='${currentConfig.bookingLink}' target='_blank' style='color: ${currentConfig.brandColor || '#8B5CF6'};'>View prices and book here</a>. Our team can also help with pricing questions if you need assistance!`;
            conversations[sessionKey].push({ role: 'assistant', content: botResponse });
            await saveMessage(conversation.conversation_id, 'assistant', botResponse);
            return res.json({ response: botResponse });
        }
    }

    // Handle booking requests
    if (currentConfig.bookingLink && (lowerMessage.includes('book') || lowerMessage.includes('reserve') || lowerMessage.includes('schedule'))) {
        const botResponse = `Ready to book? <a href='${currentConfig.bookingLink}' target='_blank' style='color: ${currentConfig.brandColor || '#8B5CF6'};'>Click here to book online</a> or speak to someone from our team for assistance!`;
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        await saveMessage(conversation.conversation_id, 'assistant', botResponse);
        return res.json({ response: botResponse });
    }

    // Normal conversation with Claude API
    const SYSTEM_PROMPT = buildEnhancedSystemPrompt(currentConfig);

    try {
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
        await saveMessage(conversation.conversation_id, 'assistant', botResponse);

        if (conversations[sessionKey].length > 20) {
            conversations[sessionKey] = conversations[sessionKey].slice(-20);
        }

        res.json({ response: botResponse });

    } catch (error) {
        console.error('Error with Claude API:', error.response?.data || error.message);

        let fallbackResponse = `Sorry, I'm having connection issues. For immediate help, please speak to someone from our team!`;
        
        conversations[sessionKey].push({ role: 'assistant', content: fallbackResponse });
        await saveMessage(conversation.conversation_id, 'assistant', fallbackResponse);
        res.json({ response: fallbackResponse });
    }
});

// Contact info capture with database storage
app.post('/contact-info', async (req, res) => {
    const { email, phone, operatorId, sessionId = 'default' } = req.body;
    const sessionKey = `${operatorId}_${sessionId}`;
    
    // Store in memory for immediate use
    customerContacts[sessionKey] = { email, phone };
    
    // Update database
    await updateCustomerContact(sessionKey, email, phone);
    
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
        message: 'Enhanced database server with dashboard is working!',
        timestamp: new Date().toISOString(),
        emailConfigured: !!emailTransporter,
        databaseConfigured: !!process.env.DATABASE_URL,
        version: 'Enhanced v2.1 with Dashboard'
    });
});

// Database health check endpoint
app.get('/api/db-health', async (req, res) => {
    try {
        const configCount = await pool.query('SELECT COUNT(*) FROM operator_configs');
        const conversationCount = await pool.query('SELECT COUNT(*) FROM conversations');
        const messageCount = await pool.query('SELECT COUNT(*) FROM messages');
        
        res.json({
            success: true,
            message: 'Database connection healthy',
            totalConfigs: parseInt(configCount.rows[0].count),
            totalConversations: parseInt(conversationCount.rows[0].count),
            totalMessages: parseInt(messageCount.rows[0].count),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message
        });
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Gracefully shutting down...');
    await pool.end();
    process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Enhanced Chatbot server with Dashboard running on port ${PORT}`);
    console.log('📝 Enhanced setup page: /setup');
    console.log('💬 Chat interface: /chat.html');
    console.log('📊 Dashboard: /dashboard');
    console.log('🔧 API test: /api/test');
    console.log('🗄️ Database health: /api/db-health');
    console.log('📧 Email service:', emailTransporter ? 'Ready' : 'Not configured');
    console.log('🗃️ Database:', process.env.DATABASE_URL ? 'Connected' : 'Not configured');
    console.log('✨ Features: Dashboard, PostgreSQL storage, Real-time chat logging');
});
