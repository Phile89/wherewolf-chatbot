const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const twilio = require('twilio');
require('dotenv').config();

// ===========================================
// CONFIGURATION & CONSTANTS
// ===========================================

const CONFIG = {
    MAX_CONVERSATION_LENGTH: 20,
    POLL_INTERVAL_HOURS: 1,
    MAX_CONNECTIONS: 20,
    CONNECTION_TIMEOUT: 30000,
    DEFAULT_RESPONSE_TIME: '30 minutes',
    DEFAULT_CONTACT_METHODS: 'email and phone',
    DEFAULT_BRAND_COLOR: '#8B5CF6'
};

console.log('🚀 Starting Enhanced Chatbot Server...');
console.log('CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? '✅ Loaded' : '❌ Missing');
console.log('GMAIL_USER:', process.env.GMAIL_USER ? '✅ Loaded' : '❌ Missing');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Loaded' : '❌ Missing');
console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Loaded' : '❌ Missing');
console.log('PORT:', process.env.PORT || 3000);

// ===========================================
// EXPRESS APP SETUP
// ===========================================

const app = express();

// Enhanced CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://wherewolf-chatbot.onrender.com', process.env.ALLOWED_ORIGIN].filter(Boolean)
        : true,
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from the root directory
app.use(express.static(__dirname));

// ===========================================
// DATABASE SETUP
// ===========================================

// Enhanced database connection with better error handling
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: CONFIG.MAX_CONNECTIONS,
    idleTimeoutMillis: CONFIG.CONNECTION_TIMEOUT,
    connectionTimeoutMillis: CONFIG.CONNECTION_TIMEOUT,
});

// Database connection error handling
pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
});

// ===========================================
// EXTERNAL SERVICES SETUP
// ===========================================

// Email transporter setup with validation
let emailTransporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    emailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS
        }
    });
    
    // Verify email configuration
    emailTransporter.verify((error, success) => {
        if (error) {
            console.log('❌ Email service verification failed:', error);
            emailTransporter = null;
        } else {
            console.log('✅ Email service verified and ready');
        }
    });
} else {
    console.log('⚠️ Email service not configured (missing credentials)');
}

// Initialize Twilio client with validation
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

if (twilioClient) {
    console.log('✅ Twilio service configured');
} else {
    console.log('⚠️ Twilio service not configured (missing credentials)');
}

// ===========================================
// IN-MEMORY STORAGE
// ===========================================

// In-memory conversation history for immediate responses (with cleanup)
const conversations = {};
const customerContacts = {};

// Cleanup old conversations from memory periodically
setInterval(() => {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    Object.keys(conversations).forEach(key => {
        if (!conversations[key].lastActivity || conversations[key].lastActivity < cutoffTime) {
            delete conversations[key];
            delete customerContacts[key];
        }
    });
}, 60 * 60 * 1000); // Run every hour

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

// Add this function after initializeDatabase() and before the conversation management functions
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    // Remove all non-digits and add + prefix
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

// Input validation middleware
function validateRequired(fields) {
    return (req, res, next) => {
        const missing = fields.filter(field => !req.body[field]);
        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${missing.join(', ')}`
            });
        }
        next();
    };
}

function extractPhoneFromMessage(message) {
    const phoneRegex = /\b\+?1?[-.\s]?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b|\b\d{10,}\b/;
    const match = message.match(phoneRegex);
    return match ? match[0] : null;
}

// ===========================================
// DATABASE INITIALIZATION WITH MIGRATIONS
// ===========================================

// Initialize database tables with all required tables and columns
async function initializeDatabase() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Operator configs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS operator_configs (
                operator_id VARCHAR(10) PRIMARY KEY,
                config JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Conversations table with all required columns
        await client.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                conversation_id SERIAL PRIMARY KEY,
                operator_id VARCHAR(10) REFERENCES operator_configs(operator_id),
                session_key VARCHAR(50) UNIQUE NOT NULL,
                customer_email VARCHAR(255),
                customer_phone VARCHAR(50),
                customer_sms_number VARCHAR(50),
                sms_enabled BOOLEAN DEFAULT FALSE,
                started_at TIMESTAMP DEFAULT NOW(),
                last_message_at TIMESTAMP DEFAULT NOW(),
                last_operator_message_at TIMESTAMP,
                message_count INTEGER DEFAULT 0,
                agent_requested BOOLEAN DEFAULT FALSE,
                status VARCHAR(20) DEFAULT 'new'
            )
        `);

        // Messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                message_id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'operator', 'system')),
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT NOW()
            )
        `);

        // SMS messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS sms_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
                from_number VARCHAR(50),
                to_number VARCHAR(50),
                message_body TEXT,
                message_sid VARCHAR(100),
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Add missing columns if they don't exist (fixed migration logic)
        const migrations = [
            {
                table: 'conversations',
                column: 'status',
                definition: 'VARCHAR(20) DEFAULT \'new\''
            },
            {
                table: 'conversations',
                column: 'last_operator_message_at',
                definition: 'TIMESTAMP'
            },
            {
                table: 'conversations',
                column: 'customer_sms_number',
                definition: 'VARCHAR(50)'
            },
            {
                table: 'conversations',
                column: 'sms_enabled',
                definition: 'BOOLEAN DEFAULT FALSE'
            }
        ];

        for (const migration of migrations) {
            // Check if column exists first
            const columnExists = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = $2
            `, [migration.table, migration.column]);
            
            if (columnExists.rows.length === 0) {
                // Column doesn't exist, add it using string concatenation to avoid parameter binding issues
                const alterQuery = `ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`;
                await client.query(alterQuery);
                console.log(`✅ Added column ${migration.column} to ${migration.table}`);
            }
        }

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_conversations_operator_id ON conversations(operator_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_session_key ON conversations(session_key);
            CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
            CREATE INDEX IF NOT EXISTS idx_conversations_agent_requested ON conversations(agent_requested);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
            CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation_id ON sms_messages(conversation_id);
        `);

        await client.query('COMMIT');
        console.log('✅ Database tables initialized successfully');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Database initialization error:', error);
        throw error;
    } finally {
        client.release();
    }
}

// ===========================================
// DATABASE FUNCTIONS
// ===========================================

// Enhanced database functions with better error handling
async function getOrCreateConversation(operatorId, sessionKey) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if conversation exists
        let result = await client.query(
            'SELECT conversation_id, customer_email, customer_phone, customer_sms_number FROM conversations WHERE session_key = $1',
            [sessionKey]
        );

        if (result.rows.length > 0) {
            await client.query('COMMIT');
            return result.rows[0];
        }

        // Create new conversation
        result = await client.query(
            'INSERT INTO conversations (operator_id, session_key) VALUES ($1, $2) RETURNING conversation_id, customer_email, customer_phone, customer_sms_number',
            [operatorId, sessionKey]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error managing conversation:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function saveMessage(conversationId, role, content) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversationId, role, content]
        );

        // Update conversation last_message_at and message_count
        await client.query(
            'UPDATE conversations SET last_message_at = NOW(), message_count = message_count + 1 WHERE conversation_id = $1',
            [conversationId]
        );

        await client.query('COMMIT');
        console.log(`💬 Message saved: ${role} in conversation ${conversationId}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saving message:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Enhanced updateCustomerContact function with detailed logging
async function updateCustomerContact(sessionKey, email = null, phone = null, smsNumber = null) {
    console.log('🔍 UPDATE CUSTOMER CONTACT DEBUG:');
    console.log('  - Session Key:', sessionKey);
    console.log('  - Email:', email || 'N/A');
    console.log('  - Phone:', phone || 'N/A');
    console.log('  - SMS Number:', smsNumber || 'N/A');
    
    const client = await pool.connect();
    try {
        // First check if conversation exists
        console.log('🔍 Checking if conversation exists...');
        const checkResult = await client.query(
            'SELECT conversation_id, customer_email, customer_phone FROM conversations WHERE session_key = $1',
            [sessionKey]
        );
        
        console.log('📊 Conversation check result:', {
            found: checkResult.rows.length > 0,
            conversationId: checkResult.rows[0]?.conversation_id,
            existingEmail: checkResult.rows[0]?.customer_email,
            existingPhone: checkResult.rows[0]?.customer_phone
        });
        
        if (checkResult.rows.length === 0) {
            console.error('❌ No conversation found for session key:', sessionKey);
            throw new Error(`No conversation found for session key: ${sessionKey}`);
        }
        
        const updateFields = [];
        const values = [];
        let valueIndex = 1;

        if (email) {
            updateFields.push(`customer_email = $${valueIndex}`);
            values.push(email);
            valueIndex++;
            console.log('📧 Will update email');
        }

        if (phone) {
            updateFields.push(`customer_phone = $${valueIndex}`);
            values.push(phone);
            valueIndex++;
            console.log('📞 Will update phone');
        }

        if (smsNumber) {
            updateFields.push(`customer_sms_number = $${valueIndex}`);
            values.push(smsNumber);
            valueIndex++;
            console.log('📱 Will update SMS number');
        }

        if (updateFields.length > 0) {
            values.push(sessionKey);
            const query = `UPDATE conversations SET ${updateFields.join(', ')} WHERE session_key = $${valueIndex}`;
            
            console.log('📝 Executing SQL query:', query);
            console.log('📝 With values:', values);
            
            const result = await client.query(query, values);
            
            console.log('✅ Update result:', {
                rowsAffected: result.rowCount,
                command: result.command
            });
            
            if (result.rowCount === 0) {
                console.error('❌ No rows were updated');
                throw new Error('No rows were updated - conversation may not exist');
            }
            
            console.log(`📧 Customer contact updated for ${sessionKey}, rows affected: ${result.rowCount}`);
        } else {
            console.log('⚠️ No contact info to update');
        }
        
    } catch (error) {
        console.error('💥 DATABASE UPDATE ERROR:');
        console.error('  - Error message:', error.message);
        console.error('  - Error code:', error.code);
        console.error('  - Error detail:', error.detail);
        console.error('  - Error severity:', error.severity);
        console.error('  - Error position:', error.position);
        console.error('  - Full error object:', error);
        throw error;
    } finally {
        client.release();
        console.log('🔄 Database client released');
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
        throw error;
    }
}

// Database function to save operator config
async function saveOperatorConfig(operatorId, config) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO operator_configs (operator_id, config, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (operator_id) 
             DO UPDATE SET config = $2, updated_at = NOW()`,
            [operatorId, JSON.stringify(config)]
        );

        await client.query('COMMIT');
        console.log(`✅ Config saved to database for operator ${operatorId}`);
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Database save error:', error);
        return false;
    } finally {
        client.release();
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

// ===========================================
// EMAIL & SMS FUNCTIONS
// ===========================================

// Enhanced function to send handoff email with better error handling
async function sendHandoffEmail(config, conversationHistory, customerContact, operatorId) {
    if (!emailTransporter) {
        console.log('⚠️ Email service not available - no transporter configured');
        return false;
    }

    try {
        const businessName = config.businessName || 'Your Business';
        const customerEmail = customerContact?.email || 'Not provided';
        const customerPhone = customerContact?.phone || 'Not provided';
        const responseTime = config.responseTime || CONFIG.DEFAULT_RESPONSE_TIME;
        const contactMethods = config.contactMethods || CONFIG.DEFAULT_CONTACT_METHODS;
        
        console.log(`🚨 Sending handoff email for ${businessName} (${operatorId})`);
        console.log(`📧 Customer contact: ${customerEmail} / ${customerPhone}`);
        
        // Format conversation history safely
        let conversationText = '';
        if (Array.isArray(conversationHistory)) {
            conversationHistory.forEach((msg) => {
                if (msg && msg.role && msg.content) {
                    const role = msg.role === 'user' ? 'Customer' : 'Chatbot';
                    conversationText += `${role}: ${msg.content}\n\n`;
                }
            });
        }

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
        const alertEmail = config.operatorEmail;

if (!alertEmail) {
    console.error('❌ No email configured for operator:', operatorId);
    console.log('💡 Make sure operator filled out email field in setup form');
    return false;
}

console.log(`📧 Sending alert to operator email: ${alertEmail}`);

const mailOptions = {
    from: process.env.GMAIL_USER,
    to: alertEmail, // 🆕 Use email from setup form!
    subject: `🚨 URGENT Agent Request: ${businessName} - ${customerEmail}`,
    text: emailContent,
    html:  `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: ${config.brandColor || CONFIG.DEFAULT_BRAND_COLOR}; color: white; padding: 20px; text-align: center;">
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
                    <div style="padding: 20px; text-align: center; background: ${config.brandColor || CONFIG.DEFAULT_BRAND_COLOR}; color: white;">
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



// 🆕 IMPROVED: Enhanced sendSMS function with better error handling
async function sendSMS(toNumber, message, conversationId) {
    if (!twilioClient) {
        console.error('❌ Twilio not configured');
        return { success: false, error: 'SMS service not configured' };
    }
    
    const client = await pool.connect();
    try {
        const result = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: toNumber
        });
        
        console.log(`📤 SMS sent to ${toNumber}: ${result.sid}`);

        // Save outbound SMS to the database
        await client.query(
            'INSERT INTO sms_messages (conversation_id, direction, from_number, to_number, message_body, message_sid, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [conversationId, 'outbound', process.env.TWILIO_PHONE_NUMBER, toNumber, message, result.sid, 'sent']
        );
        
        return { success: true, result: result };
    } catch (error) {
        console.error('❌ Error sending SMS:', error);
        
        // Save failed SMS attempt to database
        try {
            await client.query(
                'INSERT INTO sms_messages (conversation_id, direction, from_number, to_number, message_body, status) VALUES ($1, $2, $3, $4, $5, $6)',
                [conversationId, 'outbound', process.env.TWILIO_PHONE_NUMBER, toNumber, message, 'failed']
            );
        } catch (dbError) {
            console.error('Error saving failed SMS to database:', dbError);
        }
        
        return { 
            success: false, 
            error: error.message,
            code: error.code,
            moreInfo: error.moreInfo
        };
    } finally {
        client.release();
    }
}
// Replace your existing getCurrentWeather function with this fixed version

async function getCurrentWeather(location) {
    if (!process.env.OPENWEATHER_API_KEY) {
        console.log('⚠️ OpenWeather API key not configured');
        return null;
    }
    
    try {
        console.log(`🌤️ Fetching weather for: ${location}`);
        
        const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
            params: {
                q: location,
                appid: process.env.OPENWEATHER_API_KEY,
                units: 'imperial' // Use 'metric' for Celsius
            },
            timeout: 10000, // 10 second timeout (increased from 5)
            validateStatus: function (status) {
                // Don't throw errors for 4xx responses - let us handle them
                return status < 500;
            }
        });
        
        console.log(`📡 Weather API status: ${response.status} for ${location}`);
        
        // Handle different response statuses
        if (response.status === 200) {
            const weather = response.data;
            console.log(`✅ Weather success: ${weather.name}, ${weather.sys.country} - ${weather.main.temp}°F`);
            
            return {
                temp: Math.round(weather.main.temp),
                feelsLike: Math.round(weather.main.feels_like),
                description: weather.weather[0].description,
                humidity: weather.main.humidity,
                windSpeed: Math.round(weather.wind?.speed || 0),
                cloudiness: weather.clouds?.all || 0,
                city: weather.name,
                country: weather.sys.country
            };
        } else if (response.status === 404) {
            console.error(`❌ Location not found: ${location}`);
            console.error('💡 Try format like: "Miami, FL" or "Key West, Florida"');
            return null;
        } else if (response.status === 401) {
            console.error(`❌ Invalid API key for location: ${location}`);
            return null;
        } else {
            console.error(`❌ Weather API error ${response.status} for ${location}:`, response.data);
            return null;
        }
        
    } catch (error) {
        // Handle network/timeout errors
        if (error.code === 'ECONNABORTED') {
            console.error(`❌ Weather API timeout for ${location} (>10 seconds)`);
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.error(`❌ Network error fetching weather for ${location}:`, error.code);
        } else {
            console.error(`❌ Unexpected weather API error for ${location}:`, error.message);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Data:`, error.response.data);
            }
        }
        return null;
    }
}

// Test different location formats for Key West
app.get('/api/debug/location-formats', async (req, res) => {
    const testLocations = [
        'Key West, FL',
        'Key West, Florida',
        'Key West, US',
        'Key West',
        'Key West, Florida, US',
        'Miami, FL', // Known working location
    ];
    
    const results = [];
    
    for (const location of testLocations) {
        console.log(`🧪 Testing location format: ${location}`);
        
        try {
            const weather = await getCurrentWeather(location);
            results.push({
                location: location,
                success: !!weather,
                data: weather
            });
        } catch (error) {
            results.push({
                location: location,
                success: false,
                error: error.message
            });
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    res.json({
        success: true,
        message: 'Location format test results',
        results: results,
        recommendation: results.find(r => r.success)?.location || 'Try "Miami, FL" as fallback'
    });
});

// Quick fix test endpoint
app.get('/api/test-weather-fixed/:location', async (req, res) => {
    const { location } = req.params;
    
    try {
        console.log(`🔧 Testing fixed weather function for: ${location}`);
        
        const weatherData = await getCurrentWeather(location);
        
        if (weatherData) {
            const testConfig = {
                businessType: 'boat tours',
                weatherStyle: 'tour-focused'
            };
            
            const response = generateWeatherResponse(weatherData, testConfig);
            
            res.json({
                success: true,
                location: location,
                weatherData: weatherData,
                botResponse: response,
                fixed: true
            });
        } else {
            res.json({
                success: false,
                error: 'Weather data not available - check server logs for details',
                location: location,
                suggestion: 'Try /api/debug/location-formats to test different formats'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            location: location
        });
    }
});

// Add these comprehensive debug endpoints to your server.js
// Add this test endpoint to your server.js for debugging
app.post('/api/test-contact', async (req, res) => {
    console.log('🧪 TESTING CONTACT INFO SAVE...');
    
    try {
        // Test 1: Database connection
        console.log('🔍 Test 1: Database connection...');
        const timeResult = await pool.query('SELECT NOW() as current_time');
        console.log('✅ Database connected:', timeResult.rows[0]);
        
        // Test 2: Check conversations table
        console.log('🔍 Test 2: Conversations table...');
        const countResult = await pool.query('SELECT COUNT(*) as total FROM conversations');
        console.log('✅ Total conversations:', countResult.rows[0].total);
        
        // Test 3: Test session creation
        console.log('🔍 Test 3: Creating test conversation...');
        const testOperatorId = 'test_op';
        const testSessionKey = `${testOperatorId}_test_${Date.now()}`;
        
        const createResult = await pool.query(
            'INSERT INTO conversations (operator_id, session_key) VALUES ($1, $2) RETURNING conversation_id',
            [testOperatorId, testSessionKey]
        );
        
        const testConversationId = createResult.rows[0].conversation_id;
        console.log('✅ Test conversation created:', testConversationId);
        
        // Test 4: Test contact update
        console.log('🔍 Test 4: Testing contact update...');
        await updateCustomerContact(testSessionKey, 'test@example.com', '+1234567890');
        console.log('✅ Contact update successful');
        
        // Test 5: Verify update
        console.log('🔍 Test 5: Verifying update...');
        const verifyResult = await pool.query(
            'SELECT customer_email, customer_phone FROM conversations WHERE conversation_id = $1',
            [testConversationId]
        );
        console.log('✅ Updated contact info:', verifyResult.rows[0]);
        
        // Cleanup
        console.log('🧹 Cleaning up test data...');
        await pool.query('DELETE FROM conversations WHERE conversation_id = $1', [testConversationId]);
        console.log('✅ Test data cleaned up');
        
        res.json({
            success: true,
            message: 'All contact info tests passed!',
            tests: {
                databaseConnection: '✅ Passed',
                conversationsTable: '✅ Passed',
                sessionCreation: '✅ Passed',
                contactUpdate: '✅ Passed',
                verification: '✅ Passed'
            }
        });
        
    } catch (error) {
        console.error('💥 CONTACT TEST FAILED:');
        console.error('  - Error:', error.message);
        console.error('  - Code:', error.code);
        console.error('  - Detail:', error.detail);
        
        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            detail: error.detail
        });
    }
});

// Test the exact same call your server makes
app.get('/api/debug/server-test/:location', async (req, res) => {
    const { location } = req.params;
    
    try {
        console.log(`🔍 Testing server weather call for: ${location}`);
        
        const apiKey = process.env.OPENWEATHER_API_KEY;
        console.log(`🔑 API Key length: ${apiKey?.length || 0}`);
        console.log(`🔑 API Key prefix: ${apiKey?.substring(0, 8) || 'NONE'}...`);
        
        // Make the exact same call as getCurrentWeather
        const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
                q: location,
                appid: apiKey,
                units: 'imperial'
            },
            timeout: 10000,
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        console.log(`📡 Response status: ${response.status}`);
        console.log(`📊 Response headers:`, response.headers);
        
        if (response.status === 200) {
            const weather = response.data;
            return res.json({
                success: true,
                status: response.status,
                location: location,
                found: {
                    city: weather.name,
                    country: weather.sys.country,
                    temp: weather.main.temp,
                    description: weather.weather[0].description
                },
                rawData: weather
            });
        } else {
            return res.json({
                success: false,
                status: response.status,
                location: location,
                error: response.data,
                troubleshooting: {
                    401: 'Invalid API key or not activated',
                    404: 'Location not found - try different format',
                    429: 'Rate limit exceeded',
                    503: 'Service temporarily unavailable'
                }[response.status] || 'Unknown error'
            });
        }
        
    } catch (error) {
        console.error('❌ Server test error:', error.message);
        
        return res.json({
            success: false,
            error: 'Request failed',
            details: {
                message: error.message,
                code: error.code,
                status: error.response?.status,
                responseData: error.response?.data
            }
        });
    }
});

// Test multiple US cities to see which work
app.get('/api/debug/us-cities-test', async (req, res) => {
    const testCities = [
        'Denver, CO',
        'Miami, FL', 
        'Key West, FL',
        'New York, NY',
        'Los Angeles, CA',
        'Chicago, IL',
        'Denver, Colorado',
        'Miami, Florida',
        'Key West, Florida'
    ];
    
    const results = [];
    
    for (const city of testCities) {
        try {
            console.log(`🧪 Testing: ${city}`);
            
            const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
                params: {
                    q: city,
                    appid: process.env.OPENWEATHER_API_KEY,
                    units: 'imperial'
                },
                timeout: 5000,
                validateStatus: status => status < 500
            });
            
            if (response.status === 200) {
                results.push({
                    input: city,
                    status: 'SUCCESS',
                    found: `${response.data.name}, ${response.data.sys.country}`,
                    temp: `${response.data.main.temp}°F`
                });
            } else {
                results.push({
                    input: city,
                    status: 'FAILED',
                    error: response.status,
                    message: response.data?.message || 'Unknown error'
                });
            }
            
        } catch (error) {
            results.push({
                input: city,
                status: 'ERROR',
                error: error.response?.status || error.code,
                message: error.message
            });
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    const successful = results.filter(r => r.status === 'SUCCESS');
    const failed = results.filter(r => r.status !== 'SUCCESS');
    
    res.json({
        success: true,
        summary: {
            total: results.length,
            successful: successful.length,
            failed: failed.length
        },
        working: successful,
        notWorking: failed,
        recommendation: successful.length > 0 ? 
            `Use format like: "${successful[0].input}"` : 
            'No US cities working - check API key'
    });
});

// Compare your API key behavior vs a test call
app.get('/api/debug/api-key-compare', async (req, res) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    
    if (!apiKey) {
        return res.json({
            success: false,
            error: 'No API key configured'
        });
    }
    
    const testLocation = 'Denver, CO';
    
    try {
        // Test 1: Your current setup
        console.log('🧪 Test 1: Current setup');
        const test1 = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
                q: testLocation,
                appid: apiKey,
                units: 'imperial'
            },
            timeout: 10000,
            validateStatus: status => status < 500
        });
        
        // Test 2: Minimal setup (like London test that worked)
        console.log('🧪 Test 2: Minimal like London');
        const test2 = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
                q: 'London,UK',
                appid: apiKey,
                units: 'metric'
            },
            timeout: 10000,
            validateStatus: status => status < 500
        });
        
        res.json({
            success: true,
            apiKeyInfo: {
                length: apiKey.length,
                prefix: apiKey.substring(0, 8) + '...',
                isValid: apiKey.length === 32 && /^[a-f0-9]+$/i.test(apiKey)
            },
            test1_Denver: {
                status: test1.status,
                success: test1.status === 200,
                error: test1.status !== 200 ? test1.data : null,
                city: test1.status === 200 ? test1.data.name : null
            },
            test2_London: {
                status: test2.status,
                success: test2.status === 200,
                error: test2.status !== 200 ? test2.data : null,
                city: test2.status === 200 ? test2.data.name : null
            },
            diagnosis: 
                test1.status === 200 && test2.status === 200 ? 'API key works perfectly' :
                test1.status !== 200 && test2.status === 200 ? 'Location format issue with US cities' :
                test1.status === 200 && test2.status !== 200 ? 'Unexpected - Denver works but London fails' :
                'API key has issues'
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            apiKeyInfo: {
                configured: !!apiKey,
                length: apiKey?.length || 0,
                prefix: apiKey?.substring(0, 8) + '...' || 'N/A'
            }
        });
    }
});

// Fix for your operator weather config
app.get('/api/debug/operator-weather-fix/:operatorId', async (req, res) => {
    const { operatorId } = req.params;
    
    try {
        // Get the operator config
        const config = await getOperatorConfig(operatorId);
        
        if (!config) {
            return res.status(404).json({
                success: false,
                error: 'Operator not found'
            });
        }
        
        const weatherLocation = config.weatherLocation;
        
        if (!weatherLocation) {
            return res.json({
                success: false,
                error: 'No weather location configured for this operator',
                config: {
                    businessName: config.businessName,
                    weatherEnabled: config.weatherEnabled,
                    weatherLocation: config.weatherLocation
                }
            });
        }
        
        // Test the configured location
        console.log(`🌤️ Testing weather for operator ${operatorId}: ${weatherLocation}`);
        
        const weatherData = await getCurrentWeather(weatherLocation);
        
        if (weatherData) {
            const botResponse = generateWeatherResponse(weatherData, config);
            
            return res.json({
                success: true,
                operatorId: operatorId,
                businessName: config.businessName,
                weatherLocation: weatherLocation,
                weatherData: weatherData,
                botResponse: botResponse,
                status: 'Weather working for this operator'
            });
        } else {
            // Try alternative formats
            const alternatives = [
                weatherLocation.replace(', ', ','),
                weatherLocation.replace(',', ', '),
                weatherLocation.split(',')[0].trim(), // Just city name
                weatherLocation.replace(/\b(FL|CA|NY|TX)\b/, match => ({
                    'FL': 'Florida',
                    'CA': 'California', 
                    'NY': 'New York',
                    'TX': 'Texas'
                }[match] || match))
            ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
            
            const alternativeResults = [];
            
            for (const alt of alternatives) {
                const altWeather = await getCurrentWeather(alt);
                alternativeResults.push({
                    format: alt,
                    works: !!altWeather,
                    data: altWeather
                });
                
                if (altWeather) break; // Stop at first working format
            }
            
            const workingAlternative = alternativeResults.find(r => r.works);
            
            return res.json({
                success: false,
                operatorId: operatorId,
                originalLocation: weatherLocation,
                issue: 'Original location format not working',
                alternatives: alternativeResults,
                recommendation: workingAlternative ? 
                    `Update weatherLocation to: "${workingAlternative.format}"` :
                    'Try a different city or check location spelling'
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add weather response generation function
function generateWeatherResponse(weatherData, config) {
    if (!weatherData) return null;
    
    const businessType = config.businessType || 'tours';
    const weatherStyle = config.weatherStyle || 'simple';
    const temp = weatherData.temp;
    const description = weatherData.description;
    
    switch (weatherStyle) {
        case 'simple':
            return `🌤️ Current weather: ${temp}°F and ${description}!`;
            
        case 'detailed':
            return `🌤️ Current conditions in ${weatherData.city}: ${temp}°F (feels like ${weatherData.feelsLike}°F), ${description}. Humidity: ${weatherData.humidity}%, Wind: ${weatherData.windSpeed} mph.`;
            
        case 'tour-focused':
            let tourComment = '';
            if (temp >= 75 && !description.includes('rain')) {
                tourComment = ` Perfect weather for our ${businessType}!`;
            } else if (temp >= 60 && temp < 75) {
                tourComment = ` Great conditions for ${businessType} - bring a light jacket!`;
            } else if (description.includes('rain')) {
                tourComment = ` Check our weather policy for ${businessType} during rain.`;
            } else {
                tourComment = ` Current conditions for ${businessType}.`;
            }
            
            return `🌤️ Weather in ${weatherData.city}: ${temp}°F and ${description}.${tourComment}`;
            
        default:
            return `🌤️ Current weather: ${temp}°F and ${description}!`;
    }
}


// ===========================================
// SYSTEM PROMPT BUILDER (COMPLETE VERSION)
// ===========================================

// Enhanced system prompt builder with knowledge boundaries
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
    const responseTime = config.responseTime || CONFIG.DEFAULT_RESPONSE_TIME;
    const contactMethods = config.contactMethods || CONFIG.DEFAULT_CONTACT_METHODS;
    
    // Knowledge boundary settings
    const weatherInfo = config.weatherInfo || "defer";
    const realTimeInfo = config.realTimeInfo || "";
    const dontAnswerTopics = config.dontAnswerTopics || "";
    const additionalKnowledge = config.additionalKnowledge || "";
    
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

    // Build knowledge boundaries section
    let knowledgeBoundaries = `
CRITICAL RULES - YOU MUST FOLLOW THESE:
1. NEVER make up information you don't know. If you don't know something, say "I don't have that information" or "I'd need to check with our team about that."
2. NEVER guess about real-time information like current weather, today's conditions, or live availability.
3. NEVER provide specific dates or times unless they are explicitly listed in your knowledge.
4. Always be honest when you don't know something.
`;

    // Handle weather information
    if (weatherInfo === "defer") {
        knowledgeBoundaries += `
5. For ANY weather questions, say: "For current weather conditions and forecasts, please speak to someone from our team. They can provide real-time weather updates and discuss any weather-related concerns."
`;
    } else if (weatherInfo === "policy") {
        knowledgeBoundaries += `
5. For weather questions, ONLY mention our weather policy: "${weatherPolicy}". Do NOT guess about current or future weather conditions.
`;
    } else if (weatherInfo === "never") {
        knowledgeBoundaries += `
5. Do NOT discuss weather at all. If asked, say "Please contact our team directly for weather-related questions."
`;
    }

    // Add real-time information restrictions
    if (realTimeInfo) {
        const realTimeTopics = realTimeInfo.split(',').map(t => t.trim()).filter(t => t);
        knowledgeBoundaries += `
6. NEVER provide information about these real-time topics: ${realTimeTopics.join(', ')}. 
   For these topics, say: "I don't have real-time information about that. Please speak to our team for current details."
`;
    }

    // Add topics to avoid
    if (dontAnswerTopics) {
        const avoidTopics = dontAnswerTopics.split(',').map(t => t.trim()).filter(t => t);
        knowledgeBoundaries += `
7. Do NOT answer questions about: ${avoidTopics.join(', ')}.
   For these topics, say: "I can't help with that specific question. Please contact our team directly."
`;
    }

    const SYSTEM_PROMPT = `You are a ${tone.toLowerCase()} chatbot for ${businessName}${companyTagline ? ` - ${companyTagline}` : ''}.
${personalityInstructions}

${knowledgeBoundaries}

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

${additionalKnowledge ? `ADDITIONAL INFORMATION YOU KNOW:
${additionalKnowledge}
` : ''}

${expertiseLevel === "Educational focus" ? "Focus on educational aspects and learning opportunities. " : ""}
${expertiseLevel === "Detailed expert knowledge" ? "Provide detailed, expert-level information when asked. " : ""}

IMPORTANT: ${personalityInstructions}Never say "undefined" or "null". Always provide helpful information.

For cancellation requests, explain the policy but tell customers to "speak to someone from our team" to process actual cancellations. Never assume you know booking details or timing.

If someone needs complex help or wants to make special requests, suggest they can "speak to someone from our team" for personalized assistance. Our team responds within ${responseTime} via ${contactMethods}.`;

    return SYSTEM_PROMPT;
}

// ===========================================
// ROUTES - STATIC PAGES
// ===========================================

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

// ===========================================
// ROUTES - CONFIG MANAGEMENT
// ===========================================

// Endpoint to save operator config (with database)
app.post('/api/save-config', async (req, res) => {
    console.log('Received enhanced config save request:', req.body);
    
    const config = req.body;
    
    // Validate required configuration fields
    if (!config.businessName) {
        return res.status(400).json({ 
            success: false, 
            error: 'Business name is required.' 
        });
    }

    const operatorId = Math.random().toString(36).substring(2, 9); 

    try {
        const saved = await saveOperatorConfig(operatorId, config);
        
        if (!saved) {
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to save configuration to database.' 
            });
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
    buttonColor: '${config.brandColor || CONFIG.DEFAULT_BRAND_COLOR}'
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
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save configuration.' 
        });
    }
});

// Endpoint to get operator config (from database)
app.get('/api/config/:operatorId', async (req, res) => {
    const { operatorId } = req.params;
    
    // Validate operatorId format
    if (!/^[a-zA-Z0-9_-]+$/.test(operatorId)) {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid operator ID format' 
        });
    }
    
    console.log(`Looking for config in database for operator: ${operatorId}`);

    try {
        const config = await getOperatorConfig(operatorId);
        
        if (config) {
            res.json(config);
        } else {
            console.log(`Config not found for operator: ${operatorId}`);
            res.status(404).json({ 
                success: false,
                error: 'Config not found' 
            });
        }
    } catch (error) {
        console.error(`Error reading config for ${operatorId}:`, error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to read configuration.' 
        });
    }
});

// ===========================================
// ROUTES - SMS FUNCTIONALITY
// ===========================================

// SMS webhook endpoint - FIXED PHONE NORMALIZATION
app.post('/api/sms/webhook', async (req, res) => {
    const { From, To, Body, MessageSid } = req.body;
    
    console.log(`📱 Incoming SMS from ${From}: ${Body}`);
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Use your existing normalizePhone function
        const normalizePhone = (phone) => {
            if (!phone) return '';
            let normalized = phone.replace(/\D/g, '');
            if (normalized.startsWith('1') && normalized.length === 11) {
                normalized = normalized.substring(1);
            }
            return normalized;
        };
        
        const normalizedFrom = normalizePhone(From);
        console.log(`📱 Normalized phone: ${From} -> ${normalizedFrom}`);
        
        // FIXED: Get all conversations with phone numbers and check properly
        let convResult = await client.query(`
            SELECT conversation_id, operator_id, session_key, customer_phone, customer_sms_number
            FROM conversations 
            WHERE (customer_phone IS NOT NULL AND customer_phone != '') 
               OR (customer_sms_number IS NOT NULL AND customer_sms_number != '')
            ORDER BY last_message_at DESC
        `);
        
        let existingConversation = null;
        
        // Check each conversation for phone number match using JavaScript
        for (const conv of convResult.rows) {
            const normalizedCustomerPhone = normalizePhone(conv.customer_phone);
            const normalizedCustomerSms = normalizePhone(conv.customer_sms_number);
            
            console.log(`🔍 Checking conversation ${conv.conversation_id}:`);
            console.log(`   Customer phone: ${conv.customer_phone} -> ${normalizedCustomerPhone}`);
            console.log(`   Customer SMS: ${conv.customer_sms_number} -> ${normalizedCustomerSms}`);
            console.log(`   Incoming: ${From} -> ${normalizedFrom}`);
            
            if (normalizedCustomerPhone === normalizedFrom || normalizedCustomerSms === normalizedFrom) {
                existingConversation = conv;
                console.log(`✅ MATCH FOUND! Merging into conversation ${conv.conversation_id}`);
                break;
            }
        }

        let conversationId;
        let operatorId;

        if (existingConversation) {
            // Found existing conversation - MERGE into it!
            conversationId = existingConversation.conversation_id;
            operatorId = existingConversation.operator_id;
            
            // Enable SMS on this existing conversation
            await client.query(`
                UPDATE conversations 
                SET customer_sms_number = $1, sms_enabled = true, last_message_at = NOW()
                WHERE conversation_id = $2
            `, [From, conversationId]);
            
            console.log(`📱 SMS merged into existing conversation ${conversationId} for operator ${operatorId}`);
            
        } else {
            // No existing conversation found - create new one
            operatorId = 'sms_user';
            const sessionKey = `sms_${normalizedFrom}_${Date.now()}`;
            const newConv = await client.query(
                'INSERT INTO conversations (operator_id, session_key, customer_phone, customer_sms_number, sms_enabled, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING conversation_id',
                [operatorId, sessionKey, From, From, true, 'new']
            );
            conversationId = newConv.rows[0].conversation_id;
            console.log(`📱 Created new SMS conversation ${conversationId}`);
        }
        
        // Rest of your SMS saving code stays the same...
        await client.query(
            'INSERT INTO sms_messages (conversation_id, direction, from_number, to_number, message_body, message_sid, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [conversationId, 'inbound', From, To, Body, MessageSid, 'received']
        );
        
        await client.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversationId, 'user', `📱 SMS from ${From}: ${Body}`]
        );

        await client.query(
            'UPDATE conversations SET last_message_at = NOW(), message_count = message_count + 1 WHERE conversation_id = $1',
            [conversationId]
        );

        await client.query('COMMIT');
        res.status(200).send('<Response></Response>');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error processing incoming SMS:', error);
        res.status(500).send('Error processing SMS');
    } finally {
        client.release();
    }
});

// Dashboard endpoint to send SMS
app.post('/api/dashboard/send-sms', validateRequired(['conversationId', 'message']), async (req, res) => {
    const { conversationId, message } = req.body;
    
    try {
        const convResult = await pool.query(
            'SELECT customer_sms_number FROM conversations WHERE conversation_id = $1',
            [conversationId]
        );
        
        if (convResult.rows.length === 0 || !convResult.rows[0].customer_sms_number) {
            return res.status(404).json({ 
                success: false,
                error: 'Conversation or SMS number not found' 
            });
        }
        
        const customerSmsNumber = convResult.rows[0].customer_sms_number;
        const smsResult = await sendSMS(customerSmsNumber, message, conversationId);
        
        if (smsResult) {
            // Save as a regular message for dashboard display
            await saveMessage(conversationId, 'operator', `📤 SMS to ${customerSmsNumber}: ${message}`);
            res.json({ 
                success: true, 
                messageSid: smsResult.sid 
            });
        } else {
            res.status(500).json({ 
                success: false,
                error: 'Failed to send SMS' 
            });
        }
        
    } catch (error) {
        console.error('Error in dashboard send SMS endpoint:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

// ===========================================
// ROUTES - CHAT FUNCTIONALITY
// ===========================================

// 🔧 FIXED: Enhanced Chat endpoint with corrected flow
app.post('/api/chat', validateRequired(['message', 'operatorId']), async function(req, res) {
    const { message, sessionId = 'default', operatorId } = req.body;

    const sessionKey = `${operatorId}_${sessionId}`;

    try {
        // Load operator config FIRST before using it
        let currentConfig;
        try {
            currentConfig = await getOperatorConfig(operatorId);
            if (!currentConfig) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Operator config not found.' 
                });
            }
        } catch (error) {
            console.error(`Error loading config for operatorId ${operatorId}:`, error);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to load operator configuration.' 
            });
        }

        // Get or create conversation in database
        const conversation = await getOrCreateConversation(operatorId, sessionKey);
        if (!conversation) {
            return res.status(500).json({ 
                success: false,
                error: 'Failed to manage conversation' 
            });
        }

        // Save user message to database
        await saveMessage(conversation.conversation_id, 'user', message);

        // Check for contact form requirement
        try {
    // Get total user message count from database 
    const messageCountResult = await pool.query(
        'SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND role = $2',
        [conversation.conversation_id, 'user']
    );
    
    const userMessageCount = parseInt(messageCountResult.rows[0].count);
    const hasContactInfo = conversation.customer_email || conversation.customer_phone;
    
    console.log(`📊 Contact form check: userMessageCount=${userMessageCount}, hasContactInfo=${hasContactInfo}`);
            
            // Show contact form on FIRST user message if no contact info
            if (userMessageCount === 1 && !hasContactInfo) {
        console.log('📝 First message detected - showing contact form (lead magnet)');
        
        return res.json({
            success: true,
            showContactForm: true,
            pendingMessage: message
        });
    }
} catch (contactCheckError) {
    console.error('❌ Error checking contact form logic:', contactCheckError);
            // Continue with normal flow if contact check fails
        }

        // Initialize in-memory conversation for Claude API
        if (!conversations[sessionKey]) {
            conversations[sessionKey] = [];
        }
        conversations[sessionKey].push({ role: 'user', content: message });
        conversations[sessionKey].lastActivity = Date.now();

        const lowerMessage = message.toLowerCase();
        const waiverLink = currentConfig.waiverLink || "No waiver link provided.";

        // Weather detection and response (NOW currentConfig is available)
        if (currentConfig.weatherEnabled) {
            const weatherKeywords = [
                'weather', 'temperature', 'temp', 'hot', 'cold', 'warm', 'cool',
                'rain', 'rainy', 'raining', 'sunny', 'cloudy', 'overcast',
                'forecast', 'conditions', 'climate', 'degrees', 'humid',
                'windy', 'wind', 'storm', 'clear', 'nice day', 'beautiful day'
            ];
            
            const hasWeatherQuestion = weatherKeywords.some(keyword => 
                lowerMessage.includes(keyword)
            );
            
            if (hasWeatherQuestion) {
                console.log('🌤️ Weather question detected, fetching data...');
                
                const weatherData = await getCurrentWeather(currentConfig.weatherLocation);
                
                if (weatherData) {
                    const weatherResponse = generateWeatherResponse(weatherData, currentConfig);
                    
                    if (weatherResponse) {
                        conversations[sessionKey].push({ role: 'assistant', content: weatherResponse });
                        await saveMessage(conversation.conversation_id, 'assistant', weatherResponse);
                        
                        return res.json({ 
                            success: true, 
                            response: weatherResponse,
                            weatherData: true 
                        });
                    }
                } else {
                    // Fallback if weather API fails
                    const fallbackResponse = `For current weather conditions in ${currentConfig.weatherLocation}, please speak to someone from our team who can provide real-time updates!`;
                    
                    conversations[sessionKey].push({ role: 'assistant', content: fallbackResponse });
                    await saveMessage(conversation.conversation_id, 'assistant', fallbackResponse);
                    
                    return res.json({ 
                        success: true, 
                        response: fallbackResponse 
                    });
                }
            }
        }

        const defaultAgentKeywords = [
            'agent', 'human', 'speak to someone', 'talk to someone', 
            'representative', 'person', 'staff', 'manager', 'urgent',
            'speak with human', 'speak with an agent', 'speak human',
            'talk to human', 'talk with human', 'real person',
            'customer service', 'help me', 'support'
        ];
        
        let customTriggers = [];
        if (currentConfig.handoffTriggers) {
            customTriggers = currentConfig.handoffTriggers.split(',').map(t => t.trim().toLowerCase());
        }
        
        const allAgentKeywords = [...defaultAgentKeywords, ...customTriggers];
        const isAgentRequest = allAgentKeywords.some(keyword => lowerMessage.includes(keyword)) ||
            lowerMessage.includes('call me') ||
            (lowerMessage.includes('speak') && lowerMessage.includes('human')) ||
            (lowerMessage.includes('talk') && lowerMessage.includes('human')) ||
            (lowerMessage.includes('connect') && lowerMessage.includes('agent')) ||
            (lowerMessage.includes('phone') && lowerMessage.includes('call') && lowerMessage.length < 20);

        const handoffKey = `handoff_${sessionKey}`;
        const alreadyHandedOff = conversations[handoffKey] || false;

        // Handle agent handoff follow-ups
        if (alreadyHandedOff) {
            const customerContact = customerContacts[sessionKey];
            const responseTime = currentConfig.responseTime || CONFIG.DEFAULT_RESPONSE_TIME;
            const smsEnabled = currentConfig.smsEnabled || 'disabled';
            
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
            const phoneRegex = /\b\+?1?[-.\s]?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b|\b\d{10,}\b/;
            
            // Handle "text" or "SMS" choice more clearly
            if ((lowerMessage.includes('text') || lowerMessage.includes('sms')) && smsEnabled === 'hybrid') {
                // They chose SMS - send immediately
                const phone = customerContact?.phone || conversation.customer_phone || extractPhoneFromMessage(message);
                if (phone) {
                    customerContacts[sessionKey] = { ...customerContacts[sessionKey], phone };
                    await updateCustomerContact(sessionKey, null, phone);
                    // Handle "use existing phone" choice
if (lowerMessage.includes('use my existing phone') || lowerMessage.includes('existing phone')) {
    const existingPhone = customerContact?.phone || conversation.customer_phone;
    
    if (existingPhone) {
        // Send SMS to existing phone number immediately
        const businessName = currentConfig.businessName || 'Our Business';
        const smsFirstMessage = currentConfig.smsFirstMessage || '';
        const welcomeSMS = smsFirstMessage.replace('{BUSINESS_NAME}', businessName) ||
                          `Hi! This is ${businessName}. Thanks for reaching out! How can we help you today?`;
        
        const smsResult = await sendSMS(existingPhone, welcomeSMS, conversation.conversation_id);
        
        let botResponse;
        if (smsResult && smsResult.success) {
            botResponse = `Perfect! 📱 I've sent you a text at ${existingPhone}. Continue our conversation there - our team will join you shortly!`;
        } else {
            botResponse = `I have your number (${existingPhone}). Our team will text you shortly!`;
        }
        
        if (emailTransporter) {
            await sendHandoffEmail(currentConfig, conversations[sessionKey], { phone: existingPhone }, operatorId);
        }
        
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        await saveMessage(conversation.conversation_id, 'assistant', botResponse);
        return res.json({ 
            success: true, 
            response: botResponse, 
            smsEnabled: true,
            phoneCollected: true
        });
    }
}
                    // Send SMS immediately
                    const businessName = currentConfig.businessName || 'Our Business';
                    const smsFirstMessage = currentConfig.smsFirstMessage || '';
                    const welcomeSMS = smsFirstMessage.replace('{BUSINESS_NAME}', businessName) ||
                              `Hi! This is ${businessName}. Thanks for reaching out! How can we help you today?`;
                    
                    const smsResult = await sendSMS(phone, welcomeSMS, conversation.conversation_id);
                    
                    let botResponse;
                    if (smsResult && smsResult.success) {
                        botResponse = `Perfect! 📱 I've sent you a text at ${phone}. Continue our conversation there - our team will join you shortly!`;
                    } else {
                        botResponse = `I have your number (${phone}). Our team will text you shortly!`;
                    }
                    
                    if (emailTransporter) {
                        await sendHandoffEmail(currentConfig, conversations[sessionKey], { phone }, operatorId);
                    }
                    
                    conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                    await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                    return res.json({ 
                        success: true, 
                        response: botResponse, 
                        smsEnabled: true,
                        phoneCollected: true
                    });
                }
            }
            
            // Handle phone number submission for hybrid mode  
if (phoneRegex.test(message) && smsEnabled === 'hybrid') {
    const phone = message.match(phoneRegex)[0];
    
    // 🔧 FIXED: If we already have this phone number, use it immediately
    const existingPhone = customerContact?.phone || conversation.customer_phone;
    if (existingPhone && existingPhone.replace(/\D/g, '') === phone.replace(/\D/g, '')) {
        // Use existing phone number logic
        const businessName = currentConfig.businessName || 'Our Business';
        const smsFirstMessage = currentConfig.smsFirstMessage || '';
        const welcomeSMS = smsFirstMessage.replace('{BUSINESS_NAME}', businessName) ||
                          `Hi! This is ${businessName}. Thanks for reaching out! How can we help you today?`;
        
        const smsResult = await sendSMS(existingPhone, welcomeSMS, conversation.conversation_id);
        
        let botResponse;
        if (smsResult && smsResult.success) {
            botResponse = `Perfect! 📱 I've sent you a text at ${existingPhone}. Continue our conversation there - our team will join you shortly!`;
        } else {
            botResponse = `I have your number (${existingPhone}). Our team will text you shortly!`;
        }
        
        if (emailTransporter) {
            await sendHandoffEmail(currentConfig, conversations[sessionKey], { phone: existingPhone }, operatorId);
        }
        
        conversations[sessionKey].push({ role: 'assistant', content: botResponse });
        await saveMessage(conversation.conversation_id, 'assistant', botResponse);
        return res.json({ 
            success: true, 
            response: botResponse, 
            smsEnabled: true,
            phoneCollected: true
        });
    }
                customerContacts[sessionKey] = { ...customerContacts[sessionKey], phone };
                await updateCustomerContact(sessionKey, null, phone);
                
                // Send SMS immediately
                const businessName = currentConfig.businessName || 'Our Business';
                const smsFirstMessage = currentConfig.smsFirstMessage || '';
                const welcomeSMS = smsFirstMessage.replace('{BUSINESS_NAME}', businessName) ||
                              `Hi! This is ${businessName}. Thanks for reaching out! How can we help you today?`;
                
                const smsResult = await sendSMS(phone, welcomeSMS, conversation.conversation_id);
                
                let botResponse;
                if (smsResult && smsResult.success) {
                    botResponse = `Perfect! 📱 I've sent you a text at ${phone}. Continue our conversation there, and our team will join you shortly!`;
                } else {
                    botResponse = `I have your number (${phone}). Our team will text you shortly!`;
                }
                
                if (emailTransporter) {
                    await sendHandoffEmail(currentConfig, conversations[sessionKey], { phone }, operatorId);
                }
                
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ 
                    success: true, 
                    response: botResponse, 
                    smsEnabled: true, 
                    smsMode: 'hybrid',
                    phoneCollected: true
                });
            }
            
            // Handle "continue chatting here" choice
            if (lowerMessage.includes('continue chatting') || lowerMessage.includes('chat here') || 
                lowerMessage.includes('prefer') && lowerMessage.includes('here')) {
                
                if (emailTransporter) {
                    await sendHandoffEmail(currentConfig, conversations[sessionKey], customerContact, operatorId);
                }
                
                const botResponse = `Perfect! Our team will join this chat to assist you personally. They typically respond within ${responseTime}. 
                
While you wait, could I get your email or phone number so they can follow up if needed?`;
                
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ 
                    success: true, 
                    response: botResponse,
                    startPolling: true,
                    twoWayChat: true
                });
            }
            
            // Handle email collection
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
                return res.json({ success: true, response: botResponse });
            } 
            
            // Handle phone collection for disabled SMS mode (regular calling)
            if (phoneRegex.test(message) && smsEnabled === 'disabled') {
                const phone = message.match(phoneRegex)[0];
                customerContacts[sessionKey] = { ...customerContacts[sessionKey], phone };
                await updateCustomerContact(sessionKey, null, phone);
                
                if (emailTransporter) {
                    await sendHandoffEmail(currentConfig, conversations[sessionKey], { phone }, operatorId);
                }
                
                const botResponse = `Perfect! I've saved your phone number (${phone}) and our team has been notified. They'll call you within ${responseTime}. Is there anything else I can help you with while you wait?`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ success: true, response: botResponse });
            } 
            
            // Handle repeat agent requests
            if (isAgentRequest) {
                const botResponse = `Our team has already been notified and will reach out within ${responseTime}! Is there anything else I can help you with while you wait, or would you like me to provide our direct contact information?`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ success: true, response: botResponse });
            }
        }

        // 🆕 ENHANCED: Initial agent request handling with alertPreference check
if (isAgentRequest && !alreadyHandedOff) {
    
    // 🔧 CHECK ALERT PREFERENCE FIRST
    const alertPreference = currentConfig.alertPreference || 'email';
    
    if (alertPreference === 'none') {
        // AI-ONLY MODE: Redirect back to automated help
        const aiOnlyResponse = `I'm here to help you with any questions about our ${currentConfig.businessType || 'tours'}! I can provide information about pricing, schedules, locations, and policies. What specific information can I help you find?`;
        
        conversations[sessionKey].push({ role: 'assistant', content: aiOnlyResponse });
        await saveMessage(conversation.conversation_id, 'assistant', aiOnlyResponse);
        
        return res.json({ 
            success: true, 
            response: aiOnlyResponse,
            aiOnlyMode: true 
        });
    }
    
    // CONTINUE WITH HUMAN HANDOFF for 'email' and 'dashboard' modes
    await markAgentRequested(sessionKey);
    conversations[handoffKey] = true;
    
    const customerContact = customerContacts[sessionKey];
    const responseTime = currentConfig.responseTime || CONFIG.DEFAULT_RESPONSE_TIME;
    const contactMethods = currentConfig.contactMethods || CONFIG.DEFAULT_CONTACT_METHODS;
    const smsEnabled = currentConfig.smsEnabled || 'disabled';
    
    let botResponse = ''; // 🔧 FIXED: Initialize botResponse
    
    // 🔧 FIXED: Replace your hybrid mode section with this
if (smsEnabled === 'hybrid') {
    // 🔧 FIXED: Check if customer already provided phone number
    const existingPhone = customerContact?.phone || conversation.customer_phone;
    const existingEmail = customerContact?.email || conversation.customer_email;
    
    const businessSmsNumber = currentConfig.businessSmsNumber || process.env.TWILIO_PHONE_NUMBER;
    const smsHandoffMessage = currentConfig.smsHandoffMessage || 
        '💬 Prefer to text? You can also reach us at {PHONE_NUMBER} for mobile chat!';
    
    if (businessSmsNumber) {
        const formattedSmsMessage = smsHandoffMessage.replace('{PHONE_NUMBER}', businessSmsNumber);
        
        if (existingPhone) {
            // 🎯 CUSTOMER ALREADY PROVIDED PHONE - offer to use it
            botResponse = `I'd be happy to connect you with our team! They'll reach out within ${responseTime}. 

I have your contact info: ${existingEmail ? `📧 ${existingEmail}` : ''} ${existingPhone ? `📱 ${existingPhone}` : ''}

Choose how you'd like to continue:

<div style="margin: 15px 0; text-align: center;">
    <button onclick="selectChatChoice('chat')" style="
        display: block;
        width: 100%;
        margin: 8px 0;
        padding: 12px;
        background: #8B5CF6;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
    " class="choice-btn">Continue chatting here 💬</button>
    
    <button onclick="sendMessageToServer('${existingPhone}')" style="
        display: block;
        width: 100%;
        margin: 8px 0;
        padding: 12px;
        background: #10b981;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
    " class="choice-btn">Text me at ${existingPhone} 📱</button>
</div>

${formattedSmsMessage}`;
        } else {
            // 🔍 NO PHONE NUMBER YET - ask for it
            botResponse = `I'd be happy to connect you with our team! They'll reach out within ${responseTime}. 

Choose how you'd like to continue:

<div style="margin: 15px 0; text-align: center;">
    <button onclick="selectChatChoice('chat')" style="
        display: block;
        width: 100%;
        margin: 8px 0;
        padding: 12px;
        background: #8B5CF6;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
    " class="choice-btn">Continue chatting here 💬</button>
    
    <button onclick="selectChatChoice('sms')" style="
        display: block;
        width: 100%;
        margin: 8px 0;
        padding: 12px;
        background: #10b981;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
    " class="choice-btn">Switch to text messaging 📱</button>
</div>

${formattedSmsMessage}`;
        }
    } else {
        // Fallback if no SMS number configured
        botResponse = `I'd be happy to connect you with our team! They'll reach out within ${responseTime} via ${contactMethods}. Could I get your contact information?`;
    }
} else if (smsEnabled === 'sms-first') {
        // 🔧 FIXED: SMS-first mode implementation
        botResponse = `Great! I'd love to connect you with our team via text message for faster assistance.

Could you please provide your mobile number? We'll send you a quick text to get you connected with one of our team members who can help personally.

Once I have your number, our team will typically respond within ${responseTime}.`;
    } else {
        // Regular mode - no SMS
        botResponse = `I'd be happy to connect you with our team! They'll reach out within ${responseTime} via ${contactMethods}. Could I get your contact information?`;
    }
    
    // 🔧 FIXED: Safety check - ensure botResponse is always set
    if (!botResponse) {
        botResponse = `I'd be happy to connect you with our team! They'll reach out within ${responseTime}. Please provide your contact information so they can assist you.`;
    }
    
    conversations[sessionKey].push({ role: 'assistant', content: botResponse });
    await saveMessage(conversation.conversation_id, 'assistant', botResponse);
    
    // Send handoff email if email mode
    if (alertPreference === 'email' && emailTransporter) {
        try {
            await sendHandoffEmail(currentConfig, conversations[sessionKey], customerContact, operatorId);
            console.log('✅ Handoff email sent successfully');
        } catch (emailError) {
            console.error('❌ Failed to send handoff email:', emailError);
        }
    }
    
    return res.json({ 
        success: true, 
        response: botResponse,
        agentRequested: true,
        smsMode: smsEnabled,
        startPolling: alertPreference === 'dashboard',
        twoWayChat: alertPreference === 'dashboard'
    });
}
        
        // Handle waiver requests
        if (lowerMessage.includes('waiver') || lowerMessage.includes('form') || lowerMessage.includes('sign') || lowerMessage.includes('release')) {
            let botResponse;
            if (currentConfig.waiverLink && currentConfig.waiverLink.trim() && currentConfig.waiverLink !== "No waiver link provided.") {
                botResponse = `Here's your waiver: <a href='${currentConfig.waiverLink}' target='_blank' style='color: ${currentConfig.brandColor || CONFIG.DEFAULT_BRAND_COLOR};'>Click here to sign</a>`;
            } else {
                botResponse = `I'm not sure about waiver requirements. Please speak to someone from our team who can provide you with the most current waiver information.`;
            }
            conversations[sessionKey].push({ role: 'assistant', content: botResponse });
            await saveMessage(conversation.conversation_id, 'assistant', botResponse);
            return res.json({ success: true, response: botResponse });
        }

        // Handle pricing questions
        if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('pricing')) {
            if (currentConfig.bookingLink && currentConfig.bookingLink.trim()) {
                const botResponse = `For current pricing and availability, please check our booking system: <a href='${currentConfig.bookingLink}' target='_blank' style='color: ${currentConfig.brandColor || CONFIG.DEFAULT_BRAND_COLOR}; text-decoration: underline;'>View prices and book here</a>`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ success: true, response: botResponse });
            }
        }

        // Handle booking requests
        if (currentConfig.bookingLink && (lowerMessage.includes('book') || lowerMessage.includes('reserve') || lowerMessage.includes('schedule'))) {
            const botResponse = `Ready to book? <a href='${currentConfig.bookingLink}' target='_blank' style='color: ${currentConfig.brandColor || CONFIG.DEFAULT_BRAND_COLOR}; text-decoration: underline;'>Click here to book online</a>`;
            conversations[sessionKey].push({ role: 'assistant', content: botResponse });
            await saveMessage(conversation.conversation_id, 'assistant', botResponse);
            return res.json({ success: true, response: botResponse });
        }

        // Look for phone number patterns in SMS-first mode
        const phoneRegex = /\b\+?1?[-.\s]?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b|\b\d{10,}\b/;
        if (phoneRegex.test(message) && currentConfig.smsEnabled === 'sms-first') {
            const phone = message.match(phoneRegex)[0];
            
            // Store the phone number
            customerContacts[sessionKey] = { ...customerContacts[sessionKey], phone };
            await updateCustomerContact(sessionKey, null, phone);
            
            // Send SMS immediately
            const businessName = currentConfig.businessName || 'Our Business';
            const smsFirstMessage = currentConfig.smsFirstMessage || '';
            const welcomeSMS = smsFirstMessage.replace('{BUSINESS_NAME}', businessName) ||
                              `Hi! This is ${businessName}. Thanks for reaching out! How can we help you today?`;
            
            const smsResult = await sendSMS(phone, welcomeSMS, conversation.conversation_id);
            
            let botResponse;
            if (smsResult && smsResult.success) {
                botResponse = `Perfect! 📱 I've sent you a text at ${phone}. Continue our conversation there!`;
            } else {
                botResponse = `I have your number (${phone}). Our team will text you shortly!`;
            }
            
            // Send handoff email
            if (emailTransporter) {
                await sendHandoffEmail(currentConfig, conversations[sessionKey], { phone }, operatorId);
            }
            
            conversations[sessionKey].push({ role: 'assistant', content: botResponse });
            await saveMessage(conversation.conversation_id, 'assistant', botResponse);
            return res.json({ 
                success: true, 
                response: botResponse,
                smsEnabled: true
            });
        }

        // Handle location questions
        if (lowerMessage.includes('meet') || lowerMessage.includes('location') || lowerMessage.includes('where')) {
            if (currentConfig.location && currentConfig.location.trim()) {
                const botResponse = `We meet at ${currentConfig.location}. If you need more specific directions or landmarks, please speak to someone from our team!`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ success: true, response: botResponse });
            }
        }

        // Handle time questions
        if (lowerMessage.includes('time') || lowerMessage.includes('schedule') || lowerMessage.includes('when')) {
            if (currentConfig.bookingLink && currentConfig.bookingLink.trim()) {
                const botResponse = `For current tour times and availability, please check our booking system: <a href='${currentConfig.bookingLink}' target='_blank' style='color: ${currentConfig.brandColor || CONFIG.DEFAULT_BRAND_COLOR}; text-decoration: underline;'>View schedule and book here</a>`;
                conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                return res.json({ success: true, response: botResponse });
            } else if (currentConfig.times && currentConfig.times.length > 0) {
                const validTimes = currentConfig.times.filter(time => time && time.trim() !== '');
                if (validTimes.length > 0) {
                    const timesStr = validTimes.join(', ');
                    const botResponse = `Our tours typically run at: ${timesStr}. For current availability and to book, please speak to someone from our team!`;
                    conversations[sessionKey].push({ role: 'assistant', content: botResponse });
                    await saveMessage(conversation.conversation_id, 'assistant', botResponse);
                    return res.json({ success: true, response: botResponse });
                }
            }
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
                },
                timeout: 30000 // 30 second timeout
            });

            const botResponse = response.data.content[0].text;
            conversations[sessionKey].push({ role: 'assistant', content: botResponse });
            await saveMessage(conversation.conversation_id, 'assistant', botResponse);

            // Trim conversation history to prevent memory bloat
            if (conversations[sessionKey].length > CONFIG.MAX_CONVERSATION_LENGTH) {
                conversations[sessionKey] = conversations[sessionKey].slice(-CONFIG.MAX_CONVERSATION_LENGTH);
            }

            res.json({ success: true, response: botResponse });

        } catch (claudeError) {
            console.error('Error with Claude API:', claudeError.response?.data || claudeError.message);

            let fallbackResponse = `Sorry, I'm having connection issues. For immediate help, please speak to someone from our team!`;
            
            conversations[sessionKey].push({ role: 'assistant', content: fallbackResponse });
            await saveMessage(conversation.conversation_id, 'assistant', fallbackResponse);
            res.json({ success: true, response: fallbackResponse });
        }

    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: 'Please try again or contact support if the issue persists.'
        });
    }
});
// Test endpoint for weather functionality (add this separately after the chat endpoint)
app.get('/api/test-weather/:location', async (req, res) => {
    const { location } = req.params;
    
    try {
        console.log(`🧪 Testing weather for: ${location}`);
        const weatherData = await getCurrentWeather(location);
        
        if (weatherData) {
            const testConfig = {
                businessType: 'boat tours',
                weatherStyle: 'tour-focused'
            };
            
            const response = generateWeatherResponse(weatherData, testConfig);
            
            res.json({
                success: true,
                location: location,
                weatherData: weatherData,
                botResponse: response,
                apiConfigured: !!process.env.OPENWEATHER_API_KEY
            });
        } else {
            res.json({
                success: false,
                error: 'Could not fetch weather data',
                apiConfigured: !!process.env.OPENWEATHER_API_KEY
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            apiConfigured: !!process.env.OPENWEATHER_API_KEY
        });
    }
});

// Test by visiting: https://your-app.com/api/test-weather/Key%20West,%20FL



// Enhanced and more efficient poll-messages endpoint with better error handling
app.post('/api/chat/poll-messages', validateRequired(['operatorId']), async (req, res) => {
    const { operatorId, sessionId = 'default', lastMessageCount = 0 } = req.body;

    const sessionKey = `${operatorId}_${sessionId}`;

    try {
        console.log(`📡 Polling request: ${sessionKey}, lastCount: ${lastMessageCount}`);

        // Get conversation from database
        const convResult = await pool.query(
            'SELECT conversation_id, last_message_at, last_operator_message_at FROM conversations WHERE session_key = $1',
            [sessionKey]
        );

        if (convResult.rows.length === 0) {
            return res.json({ 
                success: true,
                newMessages: [], 
                totalMessages: 0,
                hasOperatorMessages: false,
                lastPolled: new Date().toISOString()
            });
        }

        const conversation = convResult.rows[0];
        const conversationId = conversation.conversation_id;

        // Get all messages for this conversation
        const messagesResult = await pool.query(`
            SELECT 
                role, 
                content, 
                timestamp,
                message_id
            FROM messages 
            WHERE conversation_id = $1 
            ORDER BY timestamp ASC, message_id ASC
        `, [conversationId]);

        const allMessages = messagesResult.rows;
        const totalMessages = allMessages.length;

        // Determine which messages are new
        const newMessages = allMessages.slice(lastMessageCount);

        // Filter for operator and system messages only for the client
        const relevantNewMessages = newMessages.filter(msg => 
            msg.role === 'operator' || msg.role === 'system'
        );

        // Check if there are any operator messages at all
        const hasOperatorMessages = allMessages.some(msg => msg.role === 'operator');

        // Enhanced response with more metadata
        const response = {
            success: true,
            newMessages: relevantNewMessages.map(msg => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp
            })),
            totalMessages: totalMessages,
            hasOperatorMessages: hasOperatorMessages,
            lastPolled: new Date().toISOString(),
            conversationId: conversationId,
            lastOperatorMessageAt: conversation.last_operator_message_at
        };

        // Set appropriate cache headers for real-time polling
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Accel-Buffering': 'no' // Disable nginx buffering for real-time responses
        });

        console.log(`📨 Poll response: ${relevantNewMessages.length} new messages, ${totalMessages} total`);
        res.json(response);

    } catch (error) {
        console.error('❌ Polling error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to poll messages',
            timestamp: new Date().toISOString(),
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Load conversation history endpoint with enhanced error handling
app.post('/api/chat/history', validateRequired(['operatorId']), async (req, res) => {
    const { operatorId, sessionId = 'default' } = req.body;

    const sessionKey = `${operatorId}_${sessionId}`;

    try {
        // Get conversation from database
        const convResult = await pool.query(
            'SELECT conversation_id, agent_requested FROM conversations WHERE session_key = $1',
            [sessionKey]
        );

        if (convResult.rows.length === 0) {
            // No conversation history
            return res.json({ 
                success: true,
                messages: [], 
                hasOperator: false, 
                agentRequested: false 
            });
        }

        const conversationId = convResult.rows[0].conversation_id;
        const agentRequested = convResult.rows[0].agent_requested;

        // Get all messages for this conversation
        const messagesResult = await pool.query(`
            SELECT role, content, timestamp
            FROM messages 
            WHERE conversation_id = $1 
            ORDER BY timestamp ASC
        `, [conversationId]);

        // Check if operator has joined
        const operatorCheckResult = await pool.query(
            'SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND role = $2',
            [conversationId, 'operator']
        );

        const hasOperator = parseInt(operatorCheckResult.rows[0].count) > 0;

        // Format messages for display
        const messages = messagesResult.rows.map(msg => ({
            role: msg.role === 'assistant' ? 'bot' : msg.role,
            content: msg.content,
            timestamp: msg.timestamp
        }));

        res.json({
            success: true,
            messages: messages,
            hasOperator: hasOperator,
            agentRequested: agentRequested
        });

    } catch (error) {
        console.error('Error loading conversation history:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load conversation history',
            messages: [],
            hasOperator: false,
            agentRequested: false
        });
    }
});

// Contact info capture with enhanced validation and database storage
// Enhanced contact info endpoint with detailed logging
app.post('/contact-info', validateRequired(['operatorId']), async (req, res) => {
    console.log('🔍 CONTACT INFO ENDPOINT DEBUG:');
    console.log('  - Request body:', JSON.stringify(req.body, null, 2));
    console.log('  - Headers:', JSON.stringify(req.headers, null, 2));
    
    const { email, phone, operatorId, sessionId = 'default' } = req.body;
    const sessionKey = `${operatorId}_${sessionId}`;
    
    console.log('📋 Processed values:');
    console.log('  - Email:', email || 'N/A');
    console.log('  - Phone:', phone || 'N/A');
    console.log('  - Operator ID:', operatorId);
    console.log('  - Session Key:', sessionKey);
    
    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.error('❌ Email validation failed:', email);
        return res.status(400).json({
            success: false,
            error: 'Invalid email format'
        });
    }
    
    // Validate phone format if provided
    if (phone && !/^[\+]?[\s\-\(\)]*([0-9][\s\-\(\)]*){10,}$/.test(phone)) {
        console.error('❌ Phone validation failed:', phone);
        return res.status(400).json({
            success: false,
            error: 'Invalid phone format'
        });
    }
    
    console.log('✅ Validation passed');
    
    try {
        // Store in memory for immediate use
        customerContacts[sessionKey] = { 
            email: email || null, 
            phone: phone || null 
        };
        console.log('✅ Stored in memory:', customerContacts[sessionKey]);
        
        // Test database connection first
        console.log('🔍 Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection OK');
        
        // 🔧 SIMPLE FIX: Create conversation if it doesn't exist
        await getOrCreateConversation(operatorId, sessionKey);
        console.log('✅ Conversation created/found');
        
        // Update database
        console.log('💾 Updating database...');
        await updateCustomerContact(sessionKey, email, phone);
        console.log('✅ Database update completed');
        
        console.log('📬 Enhanced contact info saved successfully:', {
            email: email || 'N/A',
            phone: phone || 'N/A',
            session: sessionKey
        });
        
        res.json({ 
            success: true,
            message: 'Contact information saved successfully',
            stored: {
                email: !!email,
                phone: !!phone
            }
        });
        
    } catch (error) {
        console.error('💥 CONTACT SAVE ERROR:');
        console.error('  - Error message:', error.message);
        console.error('  - Error code:', error.code);
        console.error('  - Error detail:', error.detail);
        console.error('  - Full error:', error);
        console.error('  - Stack trace:', error.stack);
        
        // Check if it's a database error
        if (error.code && error.code.startsWith('C')) {
            console.error('🗄️ This appears to be a database connection error');
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to save contact information',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ===========================================
// ROUTES - DASHBOARD
// ===========================================

// Dashboard API - Get all conversations (SINGLE VERSION)
app.get('/api/dashboard/conversations', async (req, res) => {
    try {
        const { 
            operator: operatorFilter,
            status,
            hasEmail,
            hasPhone,
            agentRequested,
            dateFrom,
            dateTo,
            search
        } = req.query;
        
        let query = `
            SELECT 
                c.conversation_id,
                c.operator_id,
                c.customer_email,
                c.customer_phone,
                c.customer_sms_number,
                c.sms_enabled,
                c.started_at,
                c.last_message_at,
                c.last_operator_message_at,
                c.message_count,
                c.agent_requested,
                c.status,
                oc.config->>'businessName' as business_name,
                (SELECT content FROM messages 
                 WHERE conversation_id = c.conversation_id 
                 ORDER BY timestamp DESC LIMIT 1) as last_message,
                -- Calculate urgency score for better sorting
                CASE 
                    WHEN c.status = 'new' AND c.agent_requested THEN 1000
                    WHEN c.status = 'in_progress' THEN 500
                    WHEN c.status = 'new' THEN 100
                    ELSE 0
                END as urgency_score
            FROM conversations c
            LEFT JOIN operator_configs oc ON c.operator_id = oc.operator_id
            WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 0;
        
        // Add filters with proper parameterization
        if (operatorFilter) {
            paramCount++;
            query += ` AND c.operator_id = $${paramCount}`;
            params.push(operatorFilter);
        }
        
        if (status && status !== 'all') {
            paramCount++;
            query += ` AND c.status = $${paramCount}`;
            params.push(status);
        }
        
        if (hasEmail === 'true') {
            query += ` AND c.customer_email IS NOT NULL AND c.customer_email != ''`;
        } else if (hasEmail === 'false') {
            query += ` AND (c.customer_email IS NULL OR c.customer_email = '')`;
        }
        
        if (hasPhone === 'true') {
            query += ` AND c.customer_phone IS NOT NULL AND c.customer_phone != ''`;
        } else if (hasPhone === 'false') {
            query += ` AND (c.customer_phone IS NULL OR c.customer_phone = '')`;
        }
        
        if (agentRequested === 'true') {
            query += ` AND c.agent_requested = true`;
        } else if (agentRequested === 'false') {
            query += ` AND c.agent_requested = false`;
        }
        
        if (dateFrom) {
            paramCount++;
            query += ` AND c.started_at >= $${paramCount}`;
            params.push(dateFrom);
        }
        
        if (dateTo) {
            paramCount++;
            query += ` AND c.started_at <= $${paramCount}`;
            params.push(dateTo);
        }
        
        if (search) {
            paramCount++;
            query += ` AND (
                c.customer_email ILIKE $${paramCount} OR 
                c.customer_phone ILIKE $${paramCount} OR
                oc.config->>'businessName' ILIKE $${paramCount} OR
                EXISTS (
                    SELECT 1 FROM messages m 
                    WHERE m.conversation_id = c.conversation_id 
                    AND m.content ILIKE $${paramCount}
                )
            )`;
            params.push(`%${search}%`);
        }
        
        // Enhanced ordering: urgency first, then recency
        query += ` ORDER BY 
            urgency_score DESC,
            c.last_message_at DESC 
            LIMIT 100`;
        
        const result = await pool.query(query, params);

        // Add computed fields for better frontend handling
        const enhancedConversations = result.rows.map(conv => ({
            ...conv,
            is_urgent: conv.urgency_score >= 1000,
            is_active: conv.status === 'in_progress' || conv.last_operator_message_at,
            needs_response: conv.status === 'new' || (conv.agent_requested && !conv.last_operator_message_at),
            has_contact: !!(conv.customer_email || conv.customer_phone)
        }));

        res.json({
            success: true,
            conversations: enhancedConversations,
            totalCount: enhancedConversations.length,
            filters: {
                operator: operatorFilter,
                status,
                hasEmail,
                hasPhone,
                agentRequested,
                dateFrom,
                dateTo,
                search
            }
        });
    } catch (error) {
        console.error('❌ Error fetching conversations:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch conversations',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get messages for a specific conversation
app.get('/api/dashboard/conversations/:id/messages', async (req, res) => {
    try {
        const conversationId = req.params.id;
        console.log('📨 Getting messages for conversation:', conversationId);
        
        // Validate conversationId is a number
        if (!/^\d+$/.test(conversationId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid conversation ID format'
            });
        }
        
        const result = await pool.query(`
            SELECT 
                message_id,
                conversation_id,
                role as sender_type,
                content,
                timestamp
            FROM messages 
            WHERE conversation_id = $1 
            ORDER BY timestamp ASC
        `, [conversationId]);
        
        console.log(`✅ Found ${result.rows.length} messages for conversation ${conversationId}`);
        
        res.json({
            success: true,
            messages: result.rows
        });
        
    } catch (error) {
        console.error('❌ Error getting conversation messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get conversation messages'
        });
    }
});

// ===========================================
// STEP 1: FIND AND REPLACE THIS EXACT ENDPOINT IN YOUR SERVER.JS
// ===========================================

// FIND this line in your server.js (around line 1800-2000):
// app.post('/api/dashboard/conversations/:id/status', async (req, res) => {

// REPLACE the entire function with this fixed version:

app.post('/api/dashboard/conversations/:id/status', async (req, res) => {
    const conversationId = req.params.id;
    const { status } = req.body;
    
    console.log('🔍 STATUS UPDATE REQUEST:');
    console.log('  - Conversation ID:', conversationId);
    console.log('  - New Status:', status);
    console.log('  - Request Body:', req.body);
    
    try {
        // Validate conversationId
        if (!conversationId || !/^\d+$/.test(conversationId)) {
            console.error('❌ Invalid conversation ID:', conversationId);
            return res.status(400).json({
                success: false,
                error: 'Invalid conversation ID format'
            });
        }
        
        // Validate status
        const validStatuses = ['new', 'in_progress', 'resolved', 'on_hold'];
        if (!status || !validStatuses.includes(status)) {
            console.error('❌ Invalid status:', status);
            return res.status(400).json({
                success: false,
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }
        
        console.log('✅ Validation passed, updating database...');
        
        // Update the database
        const result = await pool.query(
            'UPDATE conversations SET status = $1 WHERE conversation_id = $2 RETURNING conversation_id, status',
            [status, parseInt(conversationId)]
        );
        
        console.log('📊 Database query result:', result.rows);
        
        if (result.rows.length === 0) {
            console.error('❌ No conversation found with ID:', conversationId);
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }
        
        console.log('✅ Status updated successfully!');
        
        res.json({
            success: true,
            conversation: result.rows[0],
            message: `Status updated to ${status}`
        });
        
    } catch (error) {
        console.error('❌ DATABASE ERROR in status update:');
        console.error('  - Error message:', error.message);
        console.error('  - Error code:', error.code);
        console.error('  - Error detail:', error.detail);
        console.error('  - Full error:', error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to update conversation status',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ===========================================
// STEP 2: ADD THIS DEBUG ENDPOINT (temporary)
// ===========================================

// Add this RIGHT AFTER the status update endpoint:
app.get('/api/debug/conversation/:id', async (req, res) => {
    try {
        const conversationId = req.params.id;
        console.log('🔍 Debugging conversation:', conversationId);
        
        const result = await pool.query(
            'SELECT conversation_id, status, operator_id, started_at FROM conversations WHERE conversation_id = $1',
            [parseInt(conversationId)]
        );
        
        res.json({
            success: true,
            conversation: result.rows[0] || null,
            exists: result.rows.length > 0
        });
    } catch (error) {
        console.error('❌ Debug query failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===========================================
// STEP 3: ADD DATABASE CONNECTION CHECK
// ===========================================

// Add this endpoint to test your database:
app.get('/api/debug/db-test', async (req, res) => {
    try {
        console.log('🧪 Testing database connection...');
        
        // Test basic query
        const timeResult = await pool.query('SELECT NOW() as current_time');
        console.log('✅ Database time query successful:', timeResult.rows[0]);
        
        // Test conversations table
        const countResult = await pool.query('SELECT COUNT(*) as total FROM conversations');
        console.log('✅ Conversations count query successful:', countResult.rows[0]);
        
        // Test update query (safe - no actual change)
        const testResult = await pool.query(
            'SELECT conversation_id, status FROM conversations WHERE conversation_id = (SELECT MIN(conversation_id) FROM conversations)'
        );
        
        res.json({
            success: true,
            message: 'Database connection is working',
            tests: {
                timeQuery: timeResult.rows[0],
                conversationCount: countResult.rows[0],
                sampleConversation: testResult.rows[0] || 'No conversations found'
            }
        });
        
    } catch (error) {
        console.error('❌ Database test failed:', error);
        res.status(500).json({
            success: false,
            error: 'Database test failed',
            details: error.message
        });
    }
});

// ===========================================
// STEP 4: FRONTEND DEBUGGING (add to your dashboard)
// ===========================================

// Add this function to your dashboard HTML/JS to test the endpoint:
function debugStatusUpdate() {
    // Test with conversation 46 (the one that's failing)
    const testConversationId = 46;
    
    console.log('🧪 Testing status update endpoint...');
    
    // First, check if the conversation exists
    fetch(`/api/debug/conversation/${testConversationId}`)
        .then(r => r.json())
        .then(data => {
            console.log('📊 Conversation exists check:', data);
            
            if (!data.exists) {
                console.error('❌ Conversation 46 does not exist!');
                return;
            }
            
            // Now test the status update
            return fetch(`/api/dashboard/conversations/${testConversationId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'resolved' })
            });
        })
        .then(r => r.json())
        .then(data => {
            console.log('📡 Status update result:', data);
        })
        .catch(err => {
            console.error('❌ Test failed:', err);
        });
}

// Run this in your browser console to test:
// debugStatusUpdate();
// Enhanced operator message sending with immediate feedback
app.post('/api/dashboard/send-message', validateRequired(['conversationId', 'message']), async (req, res) => {
    const { conversationId, message, operatorId } = req.body;

    // Validate conversationId is a number
    if (!/^\d+$/.test(conversationId)) {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid conversation ID format' 
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if conversation exists
        const convCheck = await client.query(
            'SELECT conversation_id, session_key, status FROM conversations WHERE conversation_id = $1',
            [conversationId]
        );

        if (convCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        const conversationData = convCheck.rows[0];

        // Check if this is the first operator message in this conversation
        const existingOperatorMessages = await client.query(
            'SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND role = $2',
            [conversationId, 'operator']
        );

        const isFirstOperatorMessage = parseInt(existingOperatorMessages.rows[0].count) === 0;

        // Add system message if this is the first operator message
        if (isFirstOperatorMessage) {
            await client.query(
                'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
                [conversationId, 'system', '👨‍💼 A team member has joined the chat to assist you personally!']
            );
            
            await client.query(
                'UPDATE conversations SET last_message_at = NOW(), message_count = message_count + 1 WHERE conversation_id = $1',
                [conversationId]
            );
        }

        // Save operator message to database
        await client.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversationId, 'operator', message]
        );

        // Update conversation with operator message time and status
        await client.query(`
            UPDATE conversations 
            SET last_message_at = NOW(), 
                last_operator_message_at = NOW(),
                message_count = message_count + 1,
                status = CASE 
                    WHEN status = 'new' THEN 'in_progress' 
                    ELSE status 
                END
            WHERE conversation_id = $1`,
            [conversationId]
        );

        await client.query('COMMIT');

        // Update in-memory conversation for immediate polling response
        const sessionKey = conversationData.session_key;
        if (conversations[sessionKey]) {
            if (isFirstOperatorMessage) {
                conversations[sessionKey].push({
                    role: 'system',
                    content: '👨‍💼 A team member has joined the chat to assist you personally!'
                });
            }
            
            conversations[sessionKey].push({
                role: 'operator',
                content: message
            });

            conversations[sessionKey].lastActivity = Date.now();
        }

        console.log(`💬 Operator message sent successfully to conversation ${conversationId}`);

        res.json({ 
            success: true, 
            message: 'Operator message sent successfully',
            timestamp: new Date().toISOString(),
            isFirstMessage: isFirstOperatorMessage,
            conversationStatus: conversationData.status === 'new' ? 'in_progress' : conversationData.status
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error sending operator message:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send operator message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        client.release();
    }
});

// Dashboard API - Update conversation status with validation
app.post('/api/dashboard/update-status', validateRequired(['conversationId', 'status']), async (req, res) => {
    const { conversationId, status } = req.body;
    
    const validStatuses = ['new', 'in_progress', 'resolved', 'on_hold'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false,
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
    }
    
    // Validate conversationId is a number
    if (!/^\d+$/.test(conversationId)) {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid conversation ID format' 
        });
    }
    
    try {
        const result = await pool.query(
            'UPDATE conversations SET status = $1 WHERE conversation_id = $2',
            [status, parseInt(conversationId)]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Status updated successfully' 
        });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update status' 
        });
    }
});

// Dashboard API - Get stats
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const operatorFilter = req.query.operator;
        
        let statsQuery;
        let statsParams = [];
        
        if (operatorFilter) {
            statsQuery = `
                SELECT 
                    COUNT(*) as total_conversations,
                    COUNT(*) FILTER (WHERE agent_requested = true) as agent_requests,
                    COUNT(*) FILTER (WHERE customer_email IS NOT NULL) as with_email,
                    COUNT(DISTINCT operator_id) as active_operators
                FROM conversations 
                WHERE started_at >= NOW() - INTERVAL '7 days' AND operator_id = $1
            `;
            statsParams = [operatorFilter];
        } else {
            statsQuery = `
                SELECT 
                    COUNT(*) as total_conversations,
                    COUNT(*) FILTER (WHERE agent_requested = true) as agent_requests,
                    COUNT(*) FILTER (WHERE customer_email IS NOT NULL) as with_email,
                    COUNT(DISTINCT operator_id) as active_operators
                FROM conversations 
                WHERE started_at >= NOW() - INTERVAL '7 days'
            `;
        }

        const stats = await pool.query(statsQuery, statsParams);

        // Recent messages query
        let recentMessagesQuery;
        let recentParams = [];
        
        if (operatorFilter) {
            recentMessagesQuery = `
                SELECT COUNT(*) as total_messages
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.conversation_id
                WHERE m.timestamp >= NOW() - INTERVAL '24 hours' AND c.operator_id = $1
            `;
            recentParams = [operatorFilter];
        } else {
            recentMessagesQuery = `
                SELECT COUNT(*) as total_messages
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.conversation_id
                WHERE m.timestamp >= NOW() - INTERVAL '24 hours'
            `;
        }
        
        const recentMessages = await pool.query(recentMessagesQuery, recentParams);

        res.json({
            success: true,
            stats: {
                ...stats.rows[0],
                recent_messages: recentMessages.rows[0].total_messages
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch stats' 
        });
    }
});

// Dashboard API - Get filter statistics
app.get('/api/dashboard/filter-stats', async (req, res) => {
    try {
        const { operator: operatorFilter } = req.query;
        
        let query = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'new') as new_count,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
                COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
                COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_count,
                COUNT(*) FILTER (WHERE agent_requested = true) as agent_requested_count,
                COUNT(*) FILTER (WHERE customer_email IS NOT NULL) as with_email_count,
                COUNT(*) FILTER (WHERE customer_phone IS NOT NULL) as with_phone_count,
                COUNT(DISTINCT operator_id) as operator_count
            FROM conversations
            WHERE started_at >= NOW() - INTERVAL '30 days'
        `;
        
        const params = [];
        if (operatorFilter) {
            query += ' AND operator_id = $1';
            params.push(operatorFilter);
        }
        
        const stats = await pool.query(query, params);
        
        res.json({
            success: true,
            stats: stats.rows[0]
        });
    } catch (error) {
        console.error('Error fetching filter stats:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch statistics' 
        });
    }
});

// Get operator list for dashboard filtering
app.get('/api/dashboard/operators', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                oc.operator_id,
                oc.config->>'businessName' as business_name,
                COUNT(c.conversation_id) as conversation_count,
                MAX(c.last_message_at) as last_activity
            FROM operator_configs oc
            LEFT JOIN conversations c ON oc.operator_id = c.operator_id
            GROUP BY oc.operator_id, oc.config->>'businessName'
            ORDER BY last_activity DESC NULLS LAST
        `);
        
        res.json({
            success: true,
            operators: result.rows
        });
    } catch (error) {
        console.error('Error fetching operators:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch operators'
        });
    }
});

// ===========================================
// ROUTES - MISC & HEALTH CHECKS
// ===========================================

// Lightweight heartbeat endpoint for connection testing
app.head('/api/test', (req, res) => {
    res.status(200).end();
});

app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Enhanced database server with dashboard is working!',
        timestamp: new Date().toISOString(),
        emailConfigured: !!emailTransporter,
        databaseConfigured: !!process.env.DATABASE_URL,
        twilioConfigured: !!twilioClient,
        version: 'Enhanced v4.0 - Complete Rewrite with All Features'
    });
});

// Database health check endpoint with detailed information
app.get('/api/db-health', async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Test basic connectivity
        await pool.query('SELECT NOW()');
        
        // Get table counts
        const [configCount, conversationCount, messageCount, smsCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM operator_configs'),
            pool.query('SELECT COUNT(*) FROM conversations'),
            pool.query('SELECT COUNT(*) FROM messages'),
            pool.query('SELECT COUNT(*) FROM sms_messages')
        ]);
        
        const responseTime = Date.now() - startTime;
        
        res.json({
            success: true,
            message: 'Database connection healthy',
            responseTime: `${responseTime}ms`,
            statistics: {
                totalConfigs: parseInt(configCount.rows[0].count),
                totalConversations: parseInt(conversationCount.rows[0].count),
                totalMessages: parseInt(messageCount.rows[0].count),
                totalSmsMessages: parseInt(smsCount.rows[0].count)
            },
            poolInfo: {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Database health check failed:', error);
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ===========================================
// DEBUG ENDPOINTS - Add this section
// ===========================================

// Weather config debug endpoint
app.get('/api/debug/weather-config/:operatorId', async (req, res) => {
    try {
        const { operatorId } = req.params;
        console.log(`🔍 Debug: Checking weather config for operator ${operatorId}`);
        
        const config = await getOperatorConfig(operatorId);
        
        res.json({
            success: true,
            operatorId: operatorId,
            configFound: !!config,
            weatherEnabled: config?.weatherEnabled,
            weatherLocation: config?.weatherLocation,
            weatherStyle: config?.weatherStyle,
            apiKeyConfigured: !!process.env.OPENWEATHER_API_KEY,
            apiKeyPreview: process.env.OPENWEATHER_API_KEY ? 
                process.env.OPENWEATHER_API_KEY.substring(0, 8) + '...' : 
                'NOT SET'
        });
    } catch (error) {
        console.error('❌ Debug endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add this enhanced debug endpoint to your server.js

// Enhanced weather debug with detailed error info
app.get('/api/debug/weather-detailed/:location', async (req, res) => {
    const { location } = req.params;
    
    try {
        console.log(`🔍 Detailed weather debug for: ${location}`);
        
        const apiKey = process.env.OPENWEATHER_API_KEY;
        
        if (!apiKey) {
            return res.json({
                success: false,
                error: 'API key not configured',
                step: 'ENV_CHECK'
            });
        }
        
        console.log(`🔑 API Key first 8 chars: ${apiKey.substring(0, 8)}...`);
        console.log(`📍 Location: ${location}`);
        
        // Test the API call with full error details
        const url = 'https://api.openweathermap.org/data/2.5/weather';
        const params = {
            q: location,
            appid: apiKey,
            units: 'imperial'
        };
        
        console.log(`🌐 Making request to: ${url}`);
        console.log(`📋 Params:`, { ...params, appid: params.appid.substring(0, 8) + '...' });
        
        try {
            const response = await axios.get(url, {
                params: params,
                timeout: 10000, // 10 second timeout
                validateStatus: function (status) {
                    return status < 500; // Don't throw on 4xx errors
                }
            });
            
            console.log(`📡 Response status: ${response.status}`);
            console.log(`📊 Response data:`, response.data);
            
            if (response.status === 200) {
                const weather = response.data;
                
                const processedData = {
                    temp: Math.round(weather.main.temp),
                    feelsLike: Math.round(weather.main.feels_like),
                    description: weather.weather[0].description,
                    humidity: weather.main.humidity,
                    windSpeed: Math.round(weather.wind?.speed || 0),
                    cloudiness: weather.clouds?.all || 0,
                    city: weather.name,
                    country: weather.sys.country
                };
                
                return res.json({
                    success: true,
                    location: location,
                    rawResponse: weather,
                    processedData: processedData,
                    apiStatus: 'Working correctly',
                    requestUrl: `${url}?q=${encodeURIComponent(location)}&appid=${apiKey.substring(0, 8)}...&units=imperial`
                });
            } else {
                // API returned an error
                return res.json({
                    success: false,
                    error: 'API returned error',
                    status: response.status,
                    apiResponse: response.data,
                    possibleCauses: [
                        response.status === 401 ? 'Invalid API key' : null,
                        response.status === 404 ? 'Location not found - try "Miami, FL" format' : null,
                        response.status === 429 ? 'Rate limit exceeded' : null,
                        'API key might not be activated yet (takes 1-2 hours for new keys)'
                    ].filter(Boolean)
                });
            }
            
        } catch (axiosError) {
            console.error('🚨 Axios error:', axiosError.message);
            console.error('🚨 Error details:', {
                code: axiosError.code,
                status: axiosError.response?.status,
                statusText: axiosError.response?.statusText,
                data: axiosError.response?.data
            });
            
            return res.json({
                success: false,
                error: 'Network/Request error',
                details: {
                    message: axiosError.message,
                    code: axiosError.code,
                    status: axiosError.response?.status,
                    statusText: axiosError.response?.statusText,
                    apiResponse: axiosError.response?.data
                },
                troubleshooting: [
                    'Check if API key is valid',
                    'Verify API key is activated (new keys take 1-2 hours)',
                    'Try different location format: "Miami, FL" or "London, UK"',
                    'Check OpenWeatherMap service status'
                ]
            });
        }
        
    } catch (error) {
        console.error('💥 Unexpected error:', error);
        return res.status(500).json({
            success: false,
            error: 'Unexpected server error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Simple API key validator
app.get('/api/debug/weather-key-test', async (req, res) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    
    if (!apiKey) {
        return res.json({
            success: false,
            error: 'No API key configured',
            instructions: 'Set OPENWEATHER_API_KEY environment variable'
        });
    }
    
    try {
        // Test with a simple, reliable location
        const testResponse = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
                q: 'London,UK',
                appid: apiKey,
                units: 'metric'
            },
            timeout: 10000
        });
        
        if (testResponse.status === 200) {
            return res.json({
                success: true,
                message: 'API key is working correctly',
                keyPrefix: apiKey.substring(0, 8) + '...',
                testLocation: 'London, UK',
                testResult: {
                    city: testResponse.data.name,
                    country: testResponse.data.sys.country,
                    temp: testResponse.data.main.temp,
                    description: testResponse.data.weather[0].description
                }
            });
        } else {
            return res.json({
                success: false,
                error: 'API returned error',
                status: testResponse.status,
                keyPrefix: apiKey.substring(0, 8) + '...'
            });
        }
        
    } catch (error) {
        return res.json({
            success: false,
            error: 'API key test failed',
            message: error.message,
            keyPrefix: apiKey.substring(0, 8) + '...',
            details: error.response?.data || 'Network error'
        });
    }
});

// Fix the original getCurrentWeather function to provide better error logging
async function getCurrentWeatherFixed(location) {
    if (!process.env.OPENWEATHER_API_KEY) {
        console.log('⚠️ OpenWeather API key not configured');
        return null;
    }
    
    try {
        console.log(`🌤️ Fetching weather for: ${location}`);
        console.log(`🔑 Using API key: ${process.env.OPENWEATHER_API_KEY.substring(0, 8)}...`);
        
        const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
            params: {
                q: location,
                appid: process.env.OPENWEATHER_API_KEY,
                units: 'imperial'
            },
            timeout: 10000, // Increased timeout
            validateStatus: function (status) {
                return status < 500; // Don't throw on 4xx errors
            }
        });
        
        console.log(`📡 Weather API response status: ${response.status}`);
        
        if (response.status !== 200) {
            console.error(`❌ Weather API error ${response.status}:`, response.data);
            return null;
        }
        
        const weather = response.data;
        console.log(`✅ Weather data received for ${weather.name}, ${weather.sys.country}`);
        
        return {
            temp: Math.round(weather.main.temp),
            feelsLike: Math.round(weather.main.feels_like),
            description: weather.weather[0].description,
            humidity: weather.main.humidity,
            windSpeed: Math.round(weather.wind?.speed || 0),
            cloudiness: weather.clouds?.all || 0,
            city: weather.name,
            country: weather.sys.country
        };
    } catch (error) {
        console.error('❌ Weather API error details:');
        console.error('  Message:', error.message);
        console.error('  Code:', error.code);
        console.error('  Status:', error.response?.status);
        console.error('  Response:', error.response?.data);
        return null;
    }
}

// ===========================================
// ERROR HANDLING
// ===========================================

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `Cannot ${req.method} ${req.path}`
    });
});

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================

// Graceful shutdown handling
async function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    
    try {
        // Close database pool
        await pool.end();
        console.log('✅ Database connections closed');
        
        // Exit process
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// ===========================================
// START SERVER
// ===========================================

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Initialize database first
        await initializeDatabase();
        
        // Start HTTP server
        const server = app.listen(PORT, () => {
            console.log(`\n🚀 Enhanced Chatbot Server v4.0 running on port ${PORT}`);
            console.log('📝 Setup page: /setup');
            console.log('💬 Chat interface: /chat.html');
            console.log('📊 Dashboard: /dashboard');
            console.log('🔧 API test: /api/test');
            console.log('🗄️ Database health: /api/db-health');
            console.log(`📧 Email service: ${emailTransporter ? 'Ready' : 'Not configured'}`);
            console.log(`📱 SMS service: ${twilioClient ? 'Ready' : 'Not configured'}`);
            console.log(`🗃️ Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
            console.log('✨ Features: Enhanced error handling, SMS support, improved performance');
            console.log('🔒 Security: Input validation, SQL injection protection, rate limiting ready');
            console.log('📊 All original functionality preserved and enhanced');
        });

        // Server error handling
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use`);
                process.exit(1);
            } else {
                console.error('❌ Server error:', error);
            }
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();