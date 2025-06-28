// widget.js - Creates the chat bubble on customer websites
(function() {
    console.log('Widget.js loading...');
    
    // Get operator ID from the window object (set by embed code)
    const operatorId = window.wherewolfChatbot?.operatorId;
    
    if (!operatorId) {
        console.error('No operator ID found. Make sure embed code is correct.');
        return;
    }

    console.log('Loading widget for operator:', operatorId);

    // FIXED: Get server URL from config or detect from script source
    let serverUrl = window.wherewolfChatbot?.serverUrl;
    
    if (!serverUrl) {
        const currentScript = document.currentScript;
        if (currentScript) {
            serverUrl = currentScript.src.replace('/widget.js', '');
        } else {
            serverUrl = 'https://wherewolf-chatbot.onrender.com'; // Fallback
        }
    }

    console.log('Server URL:', serverUrl);

    // Create chat button
    const chatButton = document.createElement('div');
    chatButton.innerHTML = '💬';
    chatButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        background: ${window.wherewolfChatbot?.buttonColor || '#8B5CF6'};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 30px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        transition: transform 0.3s ease;
    `;

    // Hover effect
    chatButton.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.1)';
    });
    
    chatButton.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
    });

    // Chat widget container (initially hidden)
    const chatWidget = document.createElement('div');
    chatWidget.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 350px;
        height: 500px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 10001;
        display: none;
        flex-direction: column;
        overflow: hidden;
    `;

    // Load the chat interface
    chatWidget.innerHTML = `
        <div style="background: ${window.wherewolfChatbot?.buttonColor || '#8B5CF6'}; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 16px;">Chat with us!</h3>
            <button id="closeChat" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">×</button>
        </div>
        <iframe id="chatFrame" src="" style="flex: 1; border: none; width: 100%;"></iframe>
    `;

    let isOpen = false;

    // When clicked, toggle chat widget
    chatButton.onclick = function() {
        if (!isOpen) {
            // FIXED: Load the chat page with absolute URL
            const iframe = chatWidget.querySelector('#chatFrame');
            iframe.src = `${serverUrl}/chat.html?operator=${operatorId}`;
            
            console.log('Loading chat iframe from:', iframe.src);
            
            chatWidget.style.display = 'flex';
            chatButton.innerHTML = '✕';
            isOpen = true;
        } else {
            chatWidget.style.display = 'none';
            chatButton.innerHTML = '💬';
            isOpen = false;
        }
    };

    // Close button functionality
    chatWidget.querySelector('#closeChat').onclick = function() {
        chatWidget.style.display = 'none';
        chatButton.innerHTML = '💬';
        isOpen = false;
    };

    // Add elements to page
    document.body.appendChild(chatButton);
    document.body.appendChild(chatWidget);

    console.log('Widget loaded successfully for operator:', operatorId);
})();
