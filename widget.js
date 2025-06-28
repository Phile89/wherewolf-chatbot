// widget.js - Enhanced chat bubble with branding support
(function() {
    console.log('Enhanced Widget.js loading...');
    
    // Get configuration from the window object (set by embed code)
    const config = window.wherewolfChatbot || {};
    const operatorId = config.operatorId;
    const buttonColor = config.buttonColor || '#8B5CF6';
    
    if (!operatorId) {
        console.error('No operator ID found. Make sure embed code is correct.');
        return;
    }
    console.log('Loading enhanced widget for operator:', operatorId);
    console.log('Using brand color:', buttonColor);
    
    // Get server URL from config or detect from script source
    let serverUrl = config.serverUrl;
    
    if (!serverUrl) {
        const currentScript = document.currentScript;
        if (currentScript) {
            serverUrl = currentScript.src.replace('/widget.js', '');
        } else {
            serverUrl = 'https://wherewolf-chatbot.onrender.com'; // Fallback
        }
    }
    console.log('Server URL:', serverUrl);

    // Helper function to determine if color is light or dark
    function isLightColor(hex) {
        const r = parseInt(hex.substr(1, 2), 16);
        const g = parseInt(hex.substr(3, 2), 16);
        const b = parseInt(hex.substr(5, 2), 16);
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return brightness > 155;
    }

    // Get contrasting text color
    const textColor = isLightColor(buttonColor) ? '#000000' : '#ffffff';
    
    // Get hover color (slightly darker)
    function darkenColor(hex, percent = 10) {
        const num = parseInt(hex.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }
    
    const hoverColor = darkenColor(buttonColor, 15);

    // Create enhanced chat button
    const chatButton = document.createElement('div');
    chatButton.innerHTML = '💬';
    chatButton.id = 'wherewolf-chat-button';
    chatButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        background: ${buttonColor};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 28px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 10000;
        transition: all 0.3s ease;
        border: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        user-select: none;
        animation: wherewolf-pulse 2s infinite;
    `;

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes wherewolf-pulse {
            0% {
                box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 0 ${buttonColor}40;
            }
            70% {
                box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 10px rgba(139, 92, 246, 0);
            }
            100% {
                box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 0 rgba(139, 92, 246, 0);
            }
        }
        
        #wherewolf-chat-button:hover {
            transform: scale(1.1) !important;
            background: ${hoverColor} !important;
            box-shadow: 0 6px 25px rgba(0,0,0,0.2) !important;
        }
        
        #wherewolf-chat-widget {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        #wherewolf-chat-widget .chat-header {
            background: ${buttonColor} !important;
            color: ${textColor} !important;
        }
        
        #wherewolf-chat-widget .close-btn:hover {
            background: ${hoverColor} !important;
            color: ${textColor} !important;
        }

        @media (max-width: 768px) {
            #wherewolf-chat-widget {
                position: fixed !important;
                bottom: 0 !important;
                right: 0 !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                height: 100% !important;
                border-radius: 0 !important;
                z-index: 10001 !important;
            }
        }
    `;
    document.head.appendChild(style);

    // Enhanced chat widget container
    const chatWidget = document.createElement('div');
    chatWidget.id = 'wherewolf-chat-widget';
    chatWidget.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 380px;
        height: 520px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 30px rgba(0,0,0,0.15);
        z-index: 10001;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        border: 1px solid #e2e8f0;
    `;

    // Load the enhanced chat interface
    chatWidget.innerHTML = `
        <div class="chat-header" style="
            background: ${buttonColor}; 
            color: ${textColor}; 
            padding: 16px 20px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        ">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="
                    width: 8px; 
                    height: 8px; 
                    background: #22c55e; 
                    border-radius: 50%;
                    animation: wherewolf-pulse 2s infinite;
                "></div>
                <div>
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Chat with us!</h3>
                    <p style="margin: 0; font-size: 12px; opacity: 0.8;">We typically reply instantly</p>
                </div>
            </div>
            <button class="close-btn" style="
                background: rgba(255,255,255,0.1); 
                border: none; 
                color: ${textColor}; 
                width: 32px;
                height: 32px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                font-weight: bold;
            " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">×</button>
        </div>
        <iframe id="chatFrame" src="" style="
            flex: 1; 
            border: none; 
            width: 100%;
            background: white;
        "></iframe>
        <div style="
            padding: 12px 20px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 11px;
            color: #64748b;
        ">
            Powered by <strong style="color: ${buttonColor};">Wherewolf</strong>
        </div>
    `;

    let isOpen = false;
    let hasLoaded = false;

    // Enhanced button click functionality
    chatButton.onclick = function() {
        if (!isOpen) {
            // Load the chat page with absolute URL only once
            if (!hasLoaded) {
                const iframe = chatWidget.querySelector('#chatFrame');
                iframe.src = `${serverUrl}/chat.html?operator=${operatorId}`;
                console.log('Loading enhanced chat iframe from:', iframe.src);
                hasLoaded = true;
            }
            
            chatWidget.style.display = 'flex';
            chatButton.innerHTML = '✕';
            chatButton.style.background = hoverColor;
            isOpen = true;
            
            // Stop pulse animation when opened
            chatButton.style.animation = 'none';
            
            // Add analytics event if available
            if (typeof gtag !== 'undefined') {
                gtag('event', 'chat_opened', {
                    'custom_parameter': operatorId
                });
            }
        } else {
            chatWidget.style.display = 'none';
            chatButton.innerHTML = '💬';
            chatButton.style.background = buttonColor;
            chatButton.style.animation = 'wherewolf-pulse 2s infinite';
            isOpen = false;
        }
    };

    // Enhanced close button functionality
    chatWidget.querySelector('.close-btn').onclick = function() {
        chatWidget.style.display = 'none';
        chatButton.innerHTML = '💬';
        chatButton.style.background = buttonColor;
        chatButton.style.animation = 'wherewolf-pulse 2s infinite';
        isOpen = false;
    };

    // Close on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isOpen) {
            chatWidget.querySelector('.close-btn').click();
        }
    });

    // Auto-minimize on mobile scroll (optional)
    let lastScrollTop = 0;
    window.addEventListener('scroll', function() {
        if (window.innerWidth <= 768 && isOpen) {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            if (scrollTop > lastScrollTop + 50) { // Scrolling down
                chatWidget.style.transform = 'translateY(20px)';
                chatWidget.style.opacity = '0.8';
            } else if (scrollTop < lastScrollTop - 50) { // Scrolling up
                chatWidget.style.transform = 'translateY(0)';
                chatWidget.style.opacity = '1';
            }
            lastScrollTop = scrollTop;
        }
    });

    // Add elements to page
    document.body.appendChild(chatButton);
    document.body.appendChild(chatWidget);
    
    console.log('Enhanced widget loaded successfully!');
    console.log('Operator:', operatorId);
    console.log('Brand color:', buttonColor);
    console.log('Features: Responsive design, brand colors, pulse animation, mobile optimization');

    // Expose widget API for advanced users
    window.wherewolfWidget = {
        open: function() {
            if (!isOpen) chatButton.click();
        },
        close: function() {
            if (isOpen) chatWidget.querySelector('.close-btn').click();
        },
        toggle: function() {
            chatButton.click();
        },
        isOpen: function() {
            return isOpen;
        },
        setColor: function(color) {
            chatButton.style.background = color;
            document.querySelector('.chat-header').style.background = color;
        }
    };
})();
