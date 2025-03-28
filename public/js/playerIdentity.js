/**
 * Player Identity System
 * Handles player naming and identification with client-side persistence.
 */

// Generate a UUID v4 (random)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Get player data from localStorage or create new
function getPlayerIdentity() {
  const storedData = localStorage.getItem('wildWestPlayerIdentity');
  
  if (storedData) {
    try {
      return JSON.parse(storedData);
    } catch (e) {
      console.error('Error parsing stored player identity:', e);
      return createNewPlayerIdentity();
    }
  } else {
    return createNewPlayerIdentity();
  }
}

// Create new player identity
function createNewPlayerIdentity() {
  return {
    id: generateUUID(),
    username: '',
    createdAt: Date.now(),
    lastLogin: Date.now()
  };
}

// Save player data to localStorage
function savePlayerIdentity(playerData) {
  playerData.lastLogin = Date.now();
  localStorage.setItem('wildWestPlayerIdentity', JSON.stringify(playerData));
}

// Show username prompt
function promptForUsername(playerData) {
  return new Promise((resolve) => {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'username-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    modal.style.zIndex = '1000';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#2c2c2c';
    modalContent.style.borderRadius = '8px';
    modalContent.style.padding = '20px';
    modalContent.style.width = '90%';
    modalContent.style.maxWidth = '400px';
    modalContent.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.5)';
    modalContent.style.textAlign = 'center';
    
    // Title
    const title = document.createElement('h2');
    title.textContent = 'Enter Your Gunslinger Name';
    title.style.color = '#f8bb00';
    title.style.marginBottom = '20px';
    title.style.fontFamily = 'Western, serif';
    
    // Input field
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Your name, partner...';
    input.value = playerData.username || '';
    input.style.padding = '10px';
    input.style.width = '100%';
    input.style.borderRadius = '4px';
    input.style.border = '1px solid #444';
    input.style.backgroundColor = '#333';
    input.style.color = '#fff';
    input.style.marginBottom = '20px';
    input.style.boxSizing = 'border-box';
    
    // Submit button
    const button = document.createElement('button');
    button.textContent = 'Enter the Saloon';
    button.style.padding = '10px 20px';
    button.style.backgroundColor = '#8b0000';
    button.style.color = '#fff';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    
    // Hover effect
    button.onmouseover = () => {
      button.style.backgroundColor = '#a00000';
    };
    button.onmouseout = () => {
      button.style.backgroundColor = '#8b0000';
    };
    
    // Form handling
    const handleSubmit = () => {
      const username = input.value.trim();
      if (username) {
        playerData.username = username;
        savePlayerIdentity(playerData);
        document.body.removeChild(modal);
        resolve(playerData);
      } else {
        input.style.border = '2px solid red';
        setTimeout(() => {
          input.style.border = '1px solid #444';
        }, 1000);
      }
    };
    
    // Add event listeners
    button.addEventListener('click', handleSubmit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    });
    
    // Focus the input field when modal appears
    setTimeout(() => input.focus(), 100);
    
    // Assemble modal
    modalContent.appendChild(title);
    modalContent.appendChild(input);
    modalContent.appendChild(button);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  });
}

// Initialize player identity system
async function initPlayerIdentity() {
  let playerData = getPlayerIdentity();
  
  // If no username, prompt for one
  if (!playerData.username) {
    playerData = await promptForUsername(playerData);
  }
  
  // Update last login time
  playerData.lastLogin = Date.now();
  savePlayerIdentity(playerData);
  
  return playerData;
}

export { 
  initPlayerIdentity, 
  getPlayerIdentity, 
  savePlayerIdentity, 
  promptForUsername 
}; 