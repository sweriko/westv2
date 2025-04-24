/**
 * Chat system for player communication
 */

// Store original key handlers
let originalKeydownHandler;
let originalKeyupHandler;

// Chat state
let isChatActive = false;
let chatInputContainer;
let chatInput;
let chatMessages;
let chatContainer;
let messageCount = 0;
let lastSentMessage = null;
let lastMessageTime = 0; // Track when the last message was sent

/**
 * Initialize the chat system
 * @param {NetworkManager} networkManager - The network manager for sending messages
 */
export function initChat(networkManager) {
  createChatUI();
  setupChatEventListeners(networkManager);
}

/**
 * Create the chat UI elements
 */
function createChatUI() {
  const gameContainer = document.getElementById('game-container') || document.body;
  
  // Create chat container
  chatContainer = document.createElement('div');
  chatContainer.id = 'chat-container';
  
  // Initially size to content until we have multiple messages
  chatContainer.style.height = 'auto';
  gameContainer.appendChild(chatContainer);
  
  // Create messages container
  chatMessages = document.createElement('div');
  chatMessages.id = 'chat-messages';
  chatContainer.appendChild(chatMessages);
  
  // Create input container
  chatInputContainer = document.createElement('div');
  chatInputContainer.id = 'chat-input-container';
  gameContainer.appendChild(chatInputContainer);
  
  // Create input field
  chatInput = document.createElement('input');
  chatInput.id = 'chat-input';
  chatInput.type = 'text';
  chatInput.maxLength = 60; // Limit message length
  chatInput.placeholder = 'Type your message...';
  chatInputContainer.appendChild(chatInput);
  
  // Create send button for mobile
  const sendButton = document.createElement('button');
  sendButton.id = 'chat-send-button';
  sendButton.textContent = 'Send';
  sendButton.style.display = 'none'; // Initially hidden, shown only on mobile
  chatInputContainer.appendChild(sendButton);
  
  // Check if mobile and apply special styling
  if (isMobileDevice()) {
    // Position chat in top left for mobile - without dark background
    chatContainer.style.position = 'fixed';
    chatContainer.style.top = '10px';
    chatContainer.style.left = '0px'; // Changed from 10px to 0px - more to the left
    chatContainer.style.width = '70%';
    chatContainer.style.maxHeight = '30%';
    chatContainer.style.backgroundColor = 'transparent'; // Remove background
    chatContainer.style.zIndex = '1000';
    
    // COMPLETELY NEW APPROACH: Create a simple HTML link that opens a prompt
    // This is the most compatible approach for iOS Safari
    const chatButtonLink = document.createElement('a');
    chatButtonLink.id = 'chat-mobile-link';
    chatButtonLink.href = '#chat';  // Non-empty href required for iOS
    chatButtonLink.textContent = ''; // No text
    chatButtonLink.style.position = 'fixed';
    chatButtonLink.style.top = '10px';
    chatButtonLink.style.left = '0px'; // Also changed to 0px to match chat container
    chatButtonLink.style.width = '70%'; // Match chat container width
    chatButtonLink.style.height = '30%'; // Match chat container height
    chatButtonLink.style.padding = '0';
    chatButtonLink.style.zIndex = '2000';
    chatButtonLink.style.backgroundColor = 'transparent'; // Invisible
    chatButtonLink.style.border = 'none'; // No border
    chatButtonLink.style.color = 'transparent'; // Invisible text
    chatButtonLink.style.textDecoration = 'none';
    chatButtonLink.style.textAlign = 'left';
    chatButtonLink.style.opacity = '0'; // Make completely invisible
    // Still need pointer events to work
    chatButtonLink.style.pointerEvents = 'auto';
    
    // Add link to DOM
    document.body.appendChild(chatButtonLink);
    
    // Use simple prompt-based chat for maximum iOS compatibility
    chatButtonLink.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Use native prompt() dialog which works reliably on all browsers
      const message = prompt('Enter your message:');
      
      if (message && message.trim()) {
        // Get network manager from global scope
        const networkManager = window.networkManager;
        
        if (networkManager) {
          // Process the chat message
          lastSentMessage = message.trim();
          sendChatMessage(message.trim(), networkManager);
        }
      }
    });
    
    // Hide the standard chat input on mobile since we're using prompt
    chatInputContainer.style.display = 'none';
    
    // Add system message about chat being available - shorter version
    addSystemMessage("Tap here to chat");
  } else {
    // Add desktop-specific message
    addSystemMessage("Press \"Enter\" to chat with other players!");
  }
  
  // Adjust chat container size on window resize
  window.addEventListener('resize', updateChatPosition);
}

/**
 * Set up event listeners for the chat
 * @param {NetworkManager} networkManager - The network manager for sending messages
 */
function setupChatEventListeners(networkManager) {
  // Store original document key handlers
  originalKeydownHandler = document.onkeydown;
  originalKeyupHandler = document.onkeyup;
  
  // Add keydown event listener for chat activation
  document.addEventListener('keydown', (event) => {
    // Press Enter to toggle chat input
    if (event.code === 'Enter') {
      event.preventDefault();
      
      if (isChatActive) {
        const message = chatInput.value.trim();
        if (message) {
          lastSentMessage = message; // Store last sent message to prevent duplication
          sendChatMessage(message, networkManager);
        }
        closeChat();
      } else {
        openChat();
      }
      return;
    }
    
    // If chat is active, handle chat-specific keys
    if (isChatActive) {
      // Close chat on Escape
      if (event.code === 'Escape') {
        closeChat();
        event.preventDefault();
      }
      
      // Prevent game actions while typing
      event.stopPropagation();
    }
  }, true);
  
  // Handle clicks to close chat when clicking outside chat elements
  document.addEventListener('click', (event) => {
    if (isChatActive) {
      // Check if click is outside chat elements
      if (!chatContainer.contains(event.target) && !chatInputContainer.contains(event.target)) {
        closeChat();
      }
    }
  });
  
  // Add event listener for send button
  const sendButton = document.getElementById('chat-send-button');
  if (sendButton) {
    // Use both click and touchend for better mobile experience
    ['click', 'touchend'].forEach(eventType => {
      sendButton.addEventListener(eventType, function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const message = chatInput.value.trim();
        if (message) {
          lastSentMessage = message;
          sendChatMessage(message, networkManager);
        }
        closeChat();
      });
    });
  }
}

/**
 * Open the chat input
 */
function openChat() {
  isChatActive = true;
  chatInputContainer.style.display = 'block';
  chatInput.value = '';
  
  // Add active class to chat container for styling
  chatContainer.classList.add('active');
  
  // Unlock pointer for chat interaction
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  
  // Disable game controls while chat is active
  disableGameControls();
  
  // Special handling for mobile keyboards
  if (isMobileDevice()) {
    // Create and append a temporary button that we'll click/focus to help trigger the keyboard
    const tempButton = document.createElement('button');
    tempButton.style.position = 'fixed';
    tempButton.style.bottom = '0';
    tempButton.style.right = '0';
    tempButton.style.width = '1px';
    tempButton.style.height = '1px';
    tempButton.style.opacity = '0.01';
    tempButton.style.pointerEvents = 'none';
    document.body.appendChild(tempButton);
    
    // Force iOS Safari to show keyboard
    setTimeout(() => {
      // Remove readonly attribute completely
      chatInput.removeAttribute('readonly');
      
      // Use these attributes to help iOS Safari
      chatInput.setAttribute('autocomplete', 'off');
      chatInput.setAttribute('autocorrect', 'off');
      chatInput.setAttribute('autocapitalize', 'none');
      chatInput.style.fontSize = '16px'; // iOS Safari requires at least 16px
      
      // Click the temporary button to ensure iOS transitions focus properly
      tempButton.focus();
      tempButton.click();
      
      // Now focus and click the actual input
      chatInput.focus();
      chatInput.click();
      
      // Some iOS versions need a double focus attempt with delay
      setTimeout(() => {
        chatInput.focus();
        chatInput.click();
        
        // Remove the temporary button
        document.body.removeChild(tempButton);
      }, 50);
    }, 300);
  } else {
    chatInput.focus();
  }
}

/**
 * Close the chat input
 */
function closeChat() {
  isChatActive = false;
  chatInputContainer.style.display = 'none';
  chatInput.blur();
  
  // Remove active class from chat container
  chatContainer.classList.remove('active');
  
  // Re-lock pointer if game-container exists
  const gameContainer = document.getElementById('game-container');
  if (gameContainer) {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.requestPointerLock();
    }
  }
  
  // Re-enable game controls
  enableGameControls();
}

/**
 * Disable game controls while chatting
 */
function disableGameControls() {
  // If there's a local player, disable its movement
  if (window.localPlayer) {
    window.localPlayer.chatActive = true;
  }
}

/**
 * Re-enable game controls after chat is closed
 */
function enableGameControls() {
  // Re-enable local player movement
  if (window.localPlayer) {
    window.localPlayer.chatActive = false;
  }
}

/**
 * Send a chat message to the server
 * @param {string} message - The message to send
 * @param {NetworkManager} networkManager - The network manager for sending messages
 */
function sendChatMessage(message, networkManager) {
  // Client-side rate limiting to give immediate feedback
  const now = Date.now();
  if (now - lastMessageTime < 2000) {
    addSystemMessage("Please wait 2 seconds between messages");
    return;
  }
  
  // Update last message timestamp
  lastMessageTime = now;
  
  // Get username from player identity or use default
  const username = window.playerIdentity?.username || 'Player';
  
  // Add message to local chat first (local player message)
  addChatMessage(username, message, true);
  
  // Send message to server if network is available
  if (networkManager && networkManager.socket && 
      networkManager.socket.readyState === WebSocket.OPEN) {
    networkManager.socket.send(JSON.stringify({
      type: 'chat',
      message: message
    }));
  }
}

/**
 * Add a chat message to the UI
 * @param {string} username - The username of the sender
 * @param {string} message - The message content
 * @param {boolean} isLocal - Whether this is the local player's message
 */
export function addChatMessage(username, message, isLocal = false) {
  // Avoid duplicate messages when receiving back your own message from server
  const localUsername = window.playerIdentity?.username || 'Player';
  if (!isLocal && username === localUsername && message === lastSentMessage) {
    lastSentMessage = null; // Reset after checking
    return;
  }
  
  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message';
  
  const usernameSpan = document.createElement('span');
  usernameSpan.className = 'username';
  
  // Generate a color for the username based on the username string
  const color = getUsernameColor(username);
  
  usernameSpan.style.color = color;
  usernameSpan.textContent = username + ':';
  
  messageElement.appendChild(usernameSpan);
  messageElement.appendChild(document.createTextNode(' ' + message));
  
  chatMessages.appendChild(messageElement);
  messageCount++;
  
  // Update chat container size if needed
  updateChatPosition();
  
  // Auto scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // No fadeout or removal - messages persist indefinitely
}

/**
 * Add a system message to the chat
 * @param {string} message - The system message
 */
export function addSystemMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message system-message';
  messageElement.textContent = 'SYSTEM: ' + message;
  
  chatMessages.appendChild(messageElement);
  messageCount++;
  
  // Update chat container size if needed
  updateChatPosition();
  
  // Auto scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // System messages persist indefinitely like regular messages
}

/**
 * Generate a consistent color for a username
 * @param {string} username - The username
 * @returns {string} - CSS color string
 */
function getUsernameColor(username) {
  // Generate a hash from username string
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate bright colors by using high saturation and lightness
  const h = Math.abs(hash) % 360;  // Hue (0-360)
  const s = 70 + (Math.abs(hash) % 30);  // Saturation (70-100%)
  const l = 60 + (Math.abs(hash) % 15);  // Lightness (60-75%)
  
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * Handle incoming chat messages from other players
 * @param {Object} data - The chat message data from the server
 */
export function handleChatMessage(data) {
  addChatMessage(data.username, data.message);
}

/**
 * Check if chat is currently active
 * @returns {boolean} - True if chat input is active
 */
export function isChatInputActive() {
  return isChatActive;
}

/**
 * Update chat container position based on screen size
 */
export function updateChatPosition() {
  if (!chatContainer) return;
  
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    // Mobile positioning - top left corner, transparent background
    chatContainer.style.position = 'fixed';
    chatContainer.style.top = '10px';
    chatContainer.style.left = '0px'; // Changed from 10px to 0px - more to the left
    chatContainer.style.width = '70%';
    chatContainer.style.maxHeight = '30%';
    chatContainer.style.backgroundColor = 'transparent';
    chatContainer.style.overflow = 'auto';
    
    // Update chat button link position if it exists
    const chatButton = document.getElementById('chat-mobile-link');
    if (chatButton) {
      chatButton.style.top = '10px';
      chatButton.style.left = '0px';
      chatButton.style.width = '70%';
      chatButton.style.height = '30%';
    }
    
    // Style input for mobile (hidden but keeping styles in case we need them)
    if (chatInputContainer) {
      chatInputContainer.style.position = 'fixed';
      chatInputContainer.style.top = '50%';
      chatInputContainer.style.left = '50%';
      chatInputContainer.style.transform = 'translate(-50%, -50%)';
      chatInputContainer.style.width = '80%';
      chatInputContainer.style.maxWidth = '400px';
      chatInputContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      chatInputContainer.style.padding = '10px';
      chatInputContainer.style.borderRadius = '5px';
    }
  } else {
    // Desktop positioning - bottom left corner
    const gameHeight = window.innerHeight;
    const chatHeight = Math.min(gameHeight * 0.25, 200); // Max 25% of game height or 200px
    
    chatContainer.style.position = 'absolute';
    chatContainer.style.bottom = '80px';
    chatContainer.style.left = '20px';
    chatContainer.style.width = '400px';
    chatContainer.style.maxHeight = `${chatHeight}px`;
    
    // Style input for desktop
    if (chatInputContainer) {
      chatInputContainer.style.position = 'absolute';
      chatInputContainer.style.bottom = '20px';
      chatInputContainer.style.left = '20px';
      chatInputContainer.style.width = '400px';
      chatInputContainer.style.backgroundColor = 'transparent';
      chatInputContainer.style.transform = 'none';
    }
    
    // Hide send button on desktop
    const sendButton = document.getElementById('chat-send-button');
    if (sendButton) {
      sendButton.style.display = 'none';
    }
    
    // Style chat input for desktop
    if (chatInput) {
      chatInput.style.width = '100%';
      chatInput.style.padding = '5px';
      chatInput.style.fontSize = '14px';
    }
  }
}

/**
 * Check if the user is on a mobile device
 * @returns {boolean} True if on mobile device
 */
function isMobileDevice() {
  return (window.innerWidth <= 1024 || 'ontouchstart' in window || 
          navigator.maxTouchPoints > 0 || 
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
} 