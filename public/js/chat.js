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
  
  // Adjust chat container size on window resize
  window.addEventListener('resize', updateChatPosition);
  
  // Add initial system message
  addSystemMessage("Press \"C\" to chat with other players!");
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
    // Press C to toggle chat input
    if (event.code === 'KeyC') {
      event.preventDefault();
      
      if (isChatActive) {
        closeChat();
      } else {
        openChat();
      }
      return;
    }
    
    // If chat is active, handle chat-specific keys
    if (isChatActive) {
      // Submit message on Enter
      if (event.code === 'Enter') {
        const message = chatInput.value.trim();
        if (message) {
          lastSentMessage = message; // Store last sent message to prevent duplication
          sendChatMessage(message, networkManager);
        }
        closeChat();
        event.preventDefault();
      }
      
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
}

/**
 * Open the chat input
 */
function openChat() {
  isChatActive = true;
  chatInputContainer.style.display = 'block';
  chatInput.value = '';
  chatInput.focus();
  
  // Add active class to chat container for styling
  chatContainer.classList.add('active');
  
  // Unlock pointer for chat interaction
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  
  // Disable game controls while chat is active
  disableGameControls();
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
 * Update the chat position based on screen size
 */
export function updateChatPosition() {
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    chatContainer.style.maxWidth = '80%';
    chatInputContainer.style.width = '80%';
  } else {
    chatContainer.style.maxWidth = '400px';
    chatInputContainer.style.width = '400px';
  }
  
  // Adjust height based on message count
  if (messageCount > 5) {
    // Switch to fixed-height scrollable mode
    chatContainer.style.height = '250px';
    chatMessages.style.maxHeight = '230px';
  } else {
    // Auto height for few messages
    chatContainer.style.height = 'auto';
  }
} 