<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chatbot Setup - Enhanced</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            padding: 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 40px;
        }

        h1 {
            color: #2c3e50;
            margin-bottom: 30px;
            text-align: center;
        }

        /* Collapsible sections */
        .form-section {
            margin-bottom: 20px;
            border: 2px solid #e9ecef;
            border-radius: 12px;
            overflow: hidden;
        }

        .section-header {
            background: #f8f9fa;
            padding: 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #e9ecef;
            user-select: none;
        }

        .section-header:hover {
            background: #e9ecef;
        }

        .section-header h3 {
            margin: 0;
            color: #495057;
            font-size: 18px;
        }

        .section-toggle {
            font-size: 20px;
            color: #6c757d;
            transition: transform 0.3s ease;
        }

        .section-content {
            padding: 25px;
            display: none;
        }

        .section-content.open {
            display: block;
        }

        .section-header.open .section-toggle {
            transform: rotate(180deg);
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
        }

        .form-row-three {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #374151;
        }

        input, textarea, select {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #ced4da;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s ease;
        }

        input:focus, textarea:focus, select:focus {
            outline: none;
            border-color: #8B5CF6;
        }

        /* Multi-select activity types */
        .activity-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }

        .activity-option {
            display: flex;
            align-items: center;
            padding: 12px;
            background: white;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .activity-option:hover {
            border-color: #8B5CF6;
        }

        .activity-option.selected {
            border-color: #8B5CF6;
            background-color: #f3f0ff;
        }

        .activity-option input {
            width: auto !important;
            margin-right: 10px;
            cursor: pointer;
        }

        /* Time slots styling */
        .time-slots {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }

        .time-slot {
            display: flex;
            align-items: center;
            padding: 12px;
            background: white;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .time-slot:hover {
            border-color: #8B5CF6;
        }

        .time-slot.selected {
            border-color: #8B5CF6;
            background-color: #f3f0ff;
        }

        .time-slot input {
            width: auto !important;
            margin-right: 10px;
            cursor: pointer;
        }

        /* Color picker options */
        .color-options {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }

        .color-option {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .color-option:hover {
            border-color: #8B5CF6;
        }

        .color-option.selected {
            border-color: #8B5CF6;
            background-color: #f3f0ff;
        }

        .color-swatch {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            margin-right: 8px;
        }

        .color-option input {
            width: auto !important;
            margin: 0;
        }

        .generate-btn {
            background: #8B5CF6;
            color: white;
            padding: 16px 35px;
            border: none;
            border-radius: 10px;
            font-size: 1.2em;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            margin-top: 30px;
            transition: background 0.3s ease;
        }

        .generate-btn:hover {
            background: #7C3AED;
        }

        .embed-code {
            background: #1e293b;
            color: #94a3b8;
            padding: 25px;
            border-radius: 10px;
            margin-top: 25px;
            font-family: 'Courier New', monospace;
            position: relative;
        }

        .copy-btn {
            position: absolute;
            top: 15px;
            right: 15px;
            background: #475569;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 8px;
            cursor: pointer;
        }

        .help-text {
            font-size: 0.9em;
            color: #6c757d;
            margin-top: 8px;
        }

        .section-description {
            color: #6c757d;
            font-size: 14px;
            margin-bottom: 20px;
            font-style: italic;
        }

        /* Progress indicator */
        .progress-bar {
            width: 100%;
            height: 4px;
            background: #e9ecef;
            border-radius: 2px;
            margin-bottom: 30px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: #8B5CF6;
            width: 20%;
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚤 Enhanced Chatbot Setup</h1>
        
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>

        <form id="chatbotForm">
            <!-- Basic Information -->
            <div class="form-section">
                <div class="section-header open" onclick="toggleSection(this)">
                    <h3>📋 Basic Information</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content open">
                    <div class="section-description">Core details about your business and tour offerings</div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="businessName">Business Name *</label>
                            <input type="text" id="businessName" required placeholder="Key West Boat Tours">
                        </div>
                        <div class="form-group">
                            <label for="businessType">Primary Activity *</label>
                            <select id="businessType">
                                <option>Boat Tours</option>
                                <option>Jet Ski Rentals</option>
                                <option>Fishing Charters</option>
                                <option>Kayak Tours</option>
                                <option>Hiking Tours</option>
                                <option>City Tours</option>
                                <option>Food Tours</option>
                                <option>Wine Tasting</option>
                                <option>Adventure Sports</option>
                                <option>Cultural Experiences</option>
                                <option>Other</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="location">Location / Meeting Point *</label>
                        <input type="text" id="location" placeholder="Marina Bay, Dock 5" required>
                    </div>
                </div>
            </div>

            <!-- Business Details -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>🏢 Business Details</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">Additional business information for better customer service</div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="websiteUrl">Website URL</label>
                            <input type="url" id="websiteUrl" placeholder="https://www.yourbusiness.com">
                        </div>
                        <div class="form-group">
                            <label for="phoneNumber">Phone Number</label>
                            <input type="tel" id="phoneNumber" placeholder="+1 (555) 123-4567">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="businessHours">Business Hours</label>
                            <input type="text" id="businessHours" placeholder="8 AM - 6 PM daily">
                        </div>
                        <div class="form-group">
                            <label for="peakSeason">Peak Season</label>
                            <input type="text" id="peakSeason" placeholder="December - April">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="maxGroupSize">Maximum Group Size</label>
                            <input type="number" id="maxGroupSize" placeholder="12" min="1">
                        </div>
                        <div class="form-group">
                            <label for="companyTagline">Company Tagline</label>
                            <input type="text" id="companyTagline" placeholder="Creating unforgettable adventures">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Activity Customization -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>🎯 Activity Customization</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">Detailed information about your activities and requirements</div>
                    
                    <div class="form-group">
                        <label>Activity Types (select all that apply)</label>
                        <div class="activity-grid">
                            <label class="activity-option">
                                <input type="checkbox" value="Boat Tours" onchange="updateActivityOption(this)">
                                <span>🚤 Boat Tours</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="Fishing" onchange="updateActivityOption(this)">
                                <span>🎣 Fishing</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="Snorkeling" onchange="updateActivityOption(this)">
                                <span>🤿 Snorkeling</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="Kayaking" onchange="updateActivityOption(this)">
                                <span>🛶 Kayaking</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="Hiking" onchange="updateActivityOption(this)">
                                <span>🥾 Hiking</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="City Tours" onchange="updateActivityOption(this)">
                                <span>🏛️ City Tours</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="Food Tours" onchange="updateActivityOption(this)">
                                <span>🍽️ Food Tours</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="Wine Tasting" onchange="updateActivityOption(this)">
                                <span>🍷 Wine Tasting</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="Adventure Sports" onchange="updateActivityOption(this)">
                                <span>🏄 Adventure Sports</span>
                            </label>
                            <label class="activity-option">
                                <input type="checkbox" value="Cultural Experiences" onchange="updateActivityOption(this)">
                                <span>🎭 Cultural</span>
                            </label>
                        </div>
                    </div>

                    <div class="form-row-three">
                        <div class="form-group">
                            <label for="difficultyLevel">Difficulty Level</label>
                            <select id="difficultyLevel">
                                <option>Beginner</option>
                                <option>Intermediate</option>
                                <option>Advanced</option>
                                <option>All Levels</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="minAge">Minimum Age</label>
                            <input type="number" id="minAge" placeholder="0" min="0">
                        </div>
                        <div class="form-group">
                            <label for="maxAge">Maximum Age (0 = no limit)</label>
                            <input type="number" id="maxAge" placeholder="0" min="0">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="durationOptions">Duration Options</label>
                            <select id="durationOptions">
                                <option>Half-day (2-4 hours)</option>
                                <option>Full-day (6-8 hours)</option>
                                <option>Multi-day</option>
                                <option>Custom duration</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="seasonalAvailability">Seasonal Availability</label>
                            <select id="seasonalAvailability">
                                <option>Year-round</option>
                                <option>Seasonal (specify dates)</option>
                                <option>Weather dependent</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tour Schedule -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>⏰ Tour Schedule</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">When your tours run and how long they last</div>
                    
                    <div class="form-group">
                        <label>Standard Tour Times (select all that apply)</label>
                        <div class="time-slots">
                            <label class="time-slot">
                                <input type="checkbox" value="7:00 AM" onchange="updateTimeSlot(this)">
                                <span>7:00 AM</span>
                            </label>
                            <label class="time-slot">
                                <input type="checkbox" value="9:00 AM" onchange="updateTimeSlot(this)" checked>
                                <span>9:00 AM</span>
                            </label>
                            <label class="time-slot">
                                <input type="checkbox" value="11:00 AM" onchange="updateTimeSlot(this)">
                                <span>11:00 AM</span>
                            </label>
                            <label class="time-slot">
                                <input type="checkbox" value="1:00 PM" onchange="updateTimeSlot(this)">
                                <span>1:00 PM</span>
                            </label>
                            <label class="time-slot">
                                <input type="checkbox" value="2:00 PM" onchange="updateTimeSlot(this)" checked>
                                <span>2:00 PM</span>
                            </label>
                            <label class="time-slot">
                                <input type="checkbox" value="5:00 PM" onchange="updateTimeSlot(this)" checked>
                                <span>5:00 PM (Sunset)</span>
                            </label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="duration">Typical Tour Duration</label>
                        <input type="text" id="duration" placeholder="2.5 hours">
                    </div>
                </div>
            </div>

            <!-- Pricing -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>💰 Pricing</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">Your pricing structure and special offers</div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="adultPrice">Adult Price</label>
                            <input type="text" id="adultPrice" placeholder="$95 USD">
                        </div>
                        <div class="form-group">
                            <label for="childPrice">Child Price</label>
                            <input type="text" id="childPrice" placeholder="$65 USD (ages 4-12)">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="groupDiscount">Group Discount</label>
                            <input type="text" id="groupDiscount" placeholder="15% off for 6+ people">
                        </div>
                        <div class="form-group">
                            <label for="specialOffers">Current Special Offers</label>
                            <input type="text" id="specialOffers" placeholder="Book 2 tours, get 10% off">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Policies -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>📋 Policies</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">Important policies and what customers should know</div>
                    
                    <div class="form-group">
                        <label for="whatToBring">What to Bring</label>
                        <textarea id="whatToBring" placeholder="Sunscreen, sunglasses, camera">Sunscreen, sunglasses, camera, light jacket for evening tours</textarea>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="cancellationPolicy">Cancellation Policy</label>
                            <textarea id="cancellationPolicy" placeholder="Full refund if cancelled 24 hours before tour">Full refund if cancelled 24 hours before tour</textarea>
                        </div>
                        <div class="form-group">
                            <label for="weatherPolicy">Weather Policy</label>
                            <input type="text" id="weatherPolicy" placeholder="Tours run in light rain, full refund for storms">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Chatbot Personality -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>🤖 Chatbot Personality</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">Customize how your chatbot communicates with customers</div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="chatbotTone">Communication Tone</label>
                            <select id="chatbotTone">
                                <option>Friendly</option>
                                <option>Professional</option>
                                <option>Casual</option>
                                <option>Enthusiastic</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="languageStyle">Language Style</label>
                            <select id="languageStyle">
                                <option>Conversational</option>
                                <option>Formal</option>
                                <option>Local/Regional</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="expertiseLevel">Information Level</label>
                            <select id="expertiseLevel">
                                <option>Basic information</option>
                                <option>Detailed expert knowledge</option>
                                <option>Educational focus</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="responseLength">Response Length</label>
                            <select id="responseLength">
                                <option>Brief (1-2 sentences)</option>
                                <option>Moderate (2-3 sentences)</option>
                                <option>Detailed (3-4 sentences)</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="customGreeting">Custom Welcome Message</label>
                        <textarea id="customGreeting" placeholder="Hi! Welcome to [Business Name]. I'm here to help you plan your perfect adventure!"></textarea>
                    </div>
                </div>
            </div>

            <!-- Advanced Features -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>⚡ Advanced Features</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">Enhanced functionality and integrations</div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="bookingLink">Booking System Link</label>
                            <input type="url" id="bookingLink" placeholder="https://your-booking-system.com">
                        </div>
                        <div class="form-group">
                            <label for="socialMedia">Social Media Links</label>
                            <input type="text" id="socialMedia" placeholder="Instagram: @yourbusiness, Facebook: /yourbusiness">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="certifications">Safety Certifications & Licenses</label>
                        <textarea id="certifications" placeholder="Coast Guard licensed, First Aid certified, Insured with..."></textarea>
                    </div>
                </div>
            </div>

            <!-- Contact Preferences -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>📞 Contact Preferences</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">How and when customers can reach your team</div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="responseTime">Expected Response Time</label>
                            <select id="responseTime">
                                <option>15 minutes</option>
                                <option>30 minutes</option>
                                <option>1 hour</option>
                                <option>2 hours</option>
                                <option>Same day</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="contactMethods">Preferred Contact Methods</label>
                            <input type="text" id="contactMethods" placeholder="Email, Phone, WhatsApp">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="operatingHours">Human Support Hours</label>
                            <input type="text" id="operatingHours" placeholder="9 AM - 5 PM EST, Monday-Friday">
                        </div>
                        <div class="form-group">
                            <label for="handoffTriggers">Agent Handoff Keywords</label>
                            <input type="text" id="handoffTriggers" placeholder="urgent, emergency, complaint, refund">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Branding -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>🎨 Branding</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">Customize the look and feel of your chat widget</div>
                    
                    <div class="form-group">
                        <label>Chat Widget Color Theme</label>
                        <div class="color-options">
                            <label class="color-option selected">
                                <input type="radio" name="brandColor" value="#8B5CF6" checked onchange="updateColorOption(this)">
                                <div class="color-swatch" style="background: #8B5CF6;"></div>
                                <span>Purple</span>
                            </label>
                            <label class="color-option">
                                <input type="radio" name="brandColor" value="#3B82F6" onchange="updateColorOption(this)">
                                <div class="color-swatch" style="background: #3B82F6;"></div>
                                <span>Blue</span>
                            </label>
                            <label class="color-option">
                                <input type="radio" name="brandColor" value="#10B981" onchange="updateColorOption(this)">
                                <div class="color-swatch" style="background: #10B981;"></div>
                                <span>Green</span>
                            </label>
                            <label class="color-option">
                                <input type="radio" name="brandColor" value="#F59E0B" onchange="updateColorOption(this)">
                                <div class="color-swatch" style="background: #F59E0B;"></div>
                                <span>Orange</span>
                            </label>
                            <label class="color-option">
                                <input type="radio" name="brandColor" value="#EF4444" onchange="updateColorOption(this)">
                                <div class="color-swatch" style="background: #EF4444;"></div>
                                <span>Red</span>
                            </label>
                            <label class="color-option">
                                <input type="radio" name="brandColor" value="#6366F1" onchange="updateColorOption(this)">
                                <div class="color-swatch" style="background: #6366F1;"></div>
                                <span>Indigo</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Waiver Integration -->
            <div class="form-section">
                <div class="section-header" onclick="toggleSection(this)">
                    <h3>📝 Waiver Integration</h3>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="section-description">Connect your Wherewolf waiver system</div>
                    
                    <div class="form-group">
                        <label for="waiverLink">Your Wherewolf Waiver Link</label>
                        <input type="url" id="waiverLink" placeholder="https://mono.wherewolf.co.nz/your-waiver-id">
                        <p class="help-text">Customers will be able to ask for the waiver and get this link automatically</p>
                    </div>
                </div>
            </div>

            <button type="submit" class="generate-btn">🚀 Generate My Enhanced Chatbot</button>
        </form>

        <div id="embedSection" style="display: none;">
            <h3 style="margin-top: 40px;">🎉 Your Enhanced Chatbot is Ready!</h3>
            <p style="margin-bottom: 20px;">Copy this code and paste it into your website:</p>
            
            <div class="embed-code">
                <button class="copy-btn" onclick="copyCode()">Copy Code</button>
                <pre id="embedCode"></pre>
            </div>
        </div>
    </div>

    <script>
        // Initialize on page load
        document.addEventListener('DOMContentLoaded', function() {
            // Set initial selected states
            document.querySelectorAll('.time-slot input:checked').forEach(updateTimeSlot);
            document.querySelectorAll('.activity-option input:checked').forEach(updateActivityOption);
            document.querySelectorAll('.color-option input:checked').forEach(updateColorOption);
            
            // Update progress as user scrolls through sections
            updateProgress();
        });

        // Section toggle functionality
        function toggleSection(header) {
            const content = header.nextElementSibling;
            const isOpen = content.classList.contains('open');
            
            if (isOpen) {
                content.classList.remove('open');
                header.classList.remove('open');
            } else {
                content.classList.add('open');
                header.classList.add('open');
            }
            
            updateProgress();
        }

        // Update time slot selection
        function updateTimeSlot(checkbox) {
            const slotElement = checkbox.closest('.time-slot');
            slotElement.classList.toggle('selected', checkbox.checked);
        }

        // Update activity selection
        function updateActivityOption(checkbox) {
            const optionElement = checkbox.closest('.activity-option');
            optionElement.classList.toggle('selected', checkbox.checked);
        }

        // Update color selection
        function updateColorOption(radio) {
            document.querySelectorAll('.color-option').forEach(option => {
                option.classList.remove('selected');
            });
            radio.closest('.color-option').classList.add('selected');
        }

        // Update progress bar
        function updateProgress() {
            const totalSections = document.querySelectorAll('.form-section').length;
            const openSections = document.querySelectorAll('.section-content.open').length;
            const progress = (openSections / totalSections) * 100;
            document.getElementById('progressFill').style.width = progress + '%';
        }

        // Form submission
        document.getElementById('chatbotForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            // Collect all form data
            const selectedTimes = Array.from(document.querySelectorAll('.time-slot input:checked')).map(cb => cb.value);
            const selectedActivities = Array.from(document.querySelectorAll('.activity-option input:checked')).map(cb => cb.value);
            const selectedColor = document.querySelector('input[name="brandColor"]:checked').value;

            const config = {
                // Basic Information
                businessName: document.getElementById('businessName').value,
                businessType: document.getElementById('businessType').value,
                location: document.getElementById('location').value,
                
                // Business Details
                websiteUrl: document.getElementById('websiteUrl').value,
                phoneNumber: document.getElementById('phoneNumber').value,
                businessHours: document.getElementById('businessHours').value,
                peakSeason: document.getElementById('peakSeason').value,
                maxGroupSize: document.getElementById('maxGroupSize').value,
                companyTagline: document.getElementById('companyTagline').value,
                
                // Activity Customization
                activityTypes: selectedActivities,
                difficultyLevel: document.getElementById('difficultyLevel').value,
                minAge: document.getElementById('minAge').value,
                maxAge: document.getElementById('maxAge').value,
                durationOptions: document.getElementById('durationOptions').value,
                seasonalAvailability: document.getElementById('seasonalAvailability').value,
                
                // Schedule & Pricing
                times: selectedTimes,
                duration: document.getElementById('duration').value,
                adultPrice: document.getElementById('adultPrice').value,
                childPrice: document.getElementById('childPrice').value,
                groupDiscount: document.getElementById('groupDiscount').value,
                specialOffers: document.getElementById('specialOffers').value,
                
                // Policies
                whatToBring: document.getElementById('whatToBring').value,
                cancellationPolicy: document.getElementById('cancellationPolicy').value,
                weatherPolicy: document.getElementById('weatherPolicy').value,
                
                // Chatbot Personality
                chatbotTone: document.getElementById('chatbotTone').value,
                languageStyle: document.getElementById('languageStyle').value,
                expertiseLevel: document.getElementById('expertiseLevel').value,
                responseLength: document.getElementById('responseLength').value,
                customGreeting: document.getElementById('customGreeting').value,
                
                // Advanced Features
                bookingLink: document.getElementById('bookingLink').value,
                socialMedia: document.getElementById('socialMedia').value,
                certifications: document.getElementById('certifications').value,
                
                // Contact Preferences
                responseTime: document.getElementById('responseTime').value,
                contactMethods: document.getElementById('contactMethods').value,
                operatingHours: document.getElementById('operatingHours').value,
                handoffTriggers: document.getElementById('handoffTriggers').value,
                
                // Branding
                brandColor: selectedColor,
                
                // Waiver
                waiverLink: document.getElementById('waiverLink').value
            };

            console.log('Submitting enhanced config:', config);

            try {
                const response = await fetch('/api/save-config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(config)
                });

                const result = await response.json();
                console.log('Server response:', result);

                if (result.success && result.embedCode) {
                    document.getElementById('embedCode').textContent = result.embedCode;
                    document.getElementById('embedSection').style.display = 'block';
                    document.getElementById('embedSection').scrollIntoView({ behavior: 'smooth' });
                } else {
                    alert('Failed to generate chatbot: ' + JSON.stringify(result));
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error saving configuration: ' + error.message);
            }
        });

        function copyCode() {
            const embedCodeElement = document.getElementById('embedCode');
            const textToCopy = embedCodeElement.textContent;

            if (navigator.clipboard) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    alert('Embed code copied to clipboard!');
                });
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                alert('Embed code copied to clipboard!');
            }
        }
    </script>
</body>
</html>
