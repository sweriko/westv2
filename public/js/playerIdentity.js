/**
 * Player Identity System
 * Handles player naming and identification with client-side persistence.
 * Includes token-based authentication and session recovery.
 */

// Generate a UUID v4 (random)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generate a secure token
function generateToken() {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Check if we should bypass normal identity flow (for development/testing)
function shouldBypassIdentity() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('newplayer') || urlParams.has('dev');
}

// Get player data from storage or create new
function getPlayerIdentity() {
  try {
    // Development bypass: create a new identity if URL param is present
    if (shouldBypassIdentity()) {
      console.log('Development mode: Creating new player identity');
      return createNewPlayerIdentity();
    }
    
    // First try sessionStorage (for this browser tab only)
    const sessionData = sessionStorage.getItem('wildWestPlayerSession');
    if (sessionData) {
      const parsedData = JSON.parse(sessionData);
      console.log('Found session player data');
      return parsedData;
    }
    
    // Then try localStorage (for persistent storage)
    const storedData = localStorage.getItem('wildWestPlayerIdentity');
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        
        // Verify data integrity
        if (!parsedData.id || !parsedData.token || !parsedData.username) {
          console.warn('Incomplete player identity found, creating new');
          return createNewPlayerIdentity();
        }
        
        // Update session storage for faster access in this tab
        sessionStorage.setItem('wildWestPlayerSession', storedData);
        
        console.log('Found stored player identity');
        return parsedData;
      } catch (e) {
        console.error('Error parsing stored player identity:', e);
        return createNewPlayerIdentity();
      }
    } else {
      return createNewPlayerIdentity();
    }
  } catch (e) {
    // Handle private browsing mode where storage might be unavailable
    console.error('Error accessing storage:', e);
    return createNewPlayerIdentity(true);
  }
}

// Create new player identity
function createNewPlayerIdentity(ephemeral = false) {
  // For development/testing, append timestamp to make usernames unique across tabs
  const devSuffix = shouldBypassIdentity() ? `-${Date.now().toString().slice(-4)}` : '';
  
  const newIdentity = {
    id: generateUUID(),
    token: generateToken(),
    username: generateRandomName() + devSuffix, // Start with a random name
    createdAt: Date.now(),
    lastLogin: Date.now(),
    ephemeral: ephemeral, // Flag for when storage isn't available
    devMode: shouldBypassIdentity() // Flag to mark dev identities
  };
  
  console.log('Created new player identity');
  return newIdentity;
}

// Generate a random western-themed name
function generateRandomName() {
  const firstParts = [
    // Titles
    "Sheriff", "Deputy", "Marshal", "Doc", "Judge", "Colonel", "General", "Captain", 
    "Ranger", "Bandit", "Outlaw", "Desperado", "Gunslinger", "Bounty", "Rustler",
    // Adjectives
    "Quick", "Fast", "Slick", "Dusty", "Rusty", "Wild", "Mad", "Crazy", "Lazy", 
    "Lucky", "Unlucky", "Smoky", "Grumpy", "Gritty", "Salty", "One-eye", "One-shot",
    "Crooked", "Sneaky", "Dead-eye", "Two-gun", "Lone", "Tall", "Short", "Big", "Little"
  ];
  
  const middleParts = [
    "Dog", "Cat", "Wolf", "Iron", "Steel", "Silver", "Gold", "Copper", "Tin", 
    "Hand", "Eye", "Shot", "Gun", "Draw", "Boot", "Hat", "Star", "Badge", 
    "River", "Canyon", "Mesa", "Valley", "Rock", "Stone", "Mountain", "Desert",
    "", "", "", "", "", "" // Empty strings to increase chance of 2-part names
  ];
  
  const lastParts = [
    // Names
    "Jack", "Jim", "Joe", "Bill", "Bob", "Sam", "Tom", "Will", "Frank", "Jesse",
    "Wyatt", "Doc", "Billy", "Butch", "Roy", "Tex", "Hank", "Pete", "Buck", "Duke",
    // Nouns
    "Kid", "Smith", "Jones", "McGraw", "James", "Cassidy", "Earp", "Holliday", 
    "Dalton", "Garrett", "Hickok", "Carson", "Crockett", "Walker", "Jackson"
  ];
  
  // Randomly decide if we want 2 or 3 parts
  const useMiddlePart = Math.random() > 0.5;
  
  const first = firstParts[Math.floor(Math.random() * firstParts.length)];
  const last = lastParts[Math.floor(Math.random() * lastParts.length)];
  
  if (useMiddlePart) {
    const middle = middleParts[Math.floor(Math.random() * middleParts.length)];
    return middle ? `${first} ${middle} ${last}` : `${first} ${last}`;
  } else {
    return `${first} ${last}`;
  }
}

// Save player data to storage
function savePlayerIdentity(playerData) {
  try {
    playerData.lastLogin = Date.now();
    
    // For development mode identities, only save to session storage
    // to avoid overwriting the main identity in localStorage
    if (playerData.devMode) {
      const dataStr = JSON.stringify(playerData);
      sessionStorage.setItem('wildWestPlayerSession', dataStr);
      console.log('Development mode: Saved player identity to session storage only');
      return true;
    }
    
    // Always save to session storage for this tab
    const dataStr = JSON.stringify(playerData);
    sessionStorage.setItem('wildWestPlayerSession', dataStr);
    
    // Save to localStorage if not ephemeral
    if (!playerData.ephemeral) {
      localStorage.setItem('wildWestPlayerIdentity', dataStr);
    }
    
    return true;
  } catch (e) {
    console.error('Failed to save player identity:', e);
    return false;
  }
}

// Preload game content in background while user sets their name
function preloadGameContent() {
  console.log("Starting background preload of game content...");
  // The actual preloading happens in parallel in main.js
  // We've removed the progress bar but kept the preloading logic
}

// Show username prompt
function promptForUsername(playerData) {
  // Get device info for responsive design
  const isMobile = window.innerWidth < 768;
  const isSmallMobile = window.innerWidth < 480;
  const isVerySmallMobile = window.innerWidth < 360;
  const isSmallScreen = window.innerWidth < 1024;
  
  // Constants for easy adjustments - responsive values based on screen size
  const UI_CONSTANTS = {
    // Image sizes (percentage of container width)
    TITLE_IMAGE_WIDTH: isVerySmallMobile ? '260px' : (isSmallMobile ? '300px' : (isMobile ? '350px' : (isSmallScreen ? '400px' : '450px'))),
    NAME_SUBMIT_WIDTH: isVerySmallMobile ? '260px' : (isSmallMobile ? '300px' : (isMobile ? '350px' : (isSmallScreen ? '400px' : '450px'))),
    ENTER_GAME_WIDTH: isVerySmallMobile ? '260px' : (isSmallMobile ? '300px' : (isMobile ? '350px' : (isSmallScreen ? '400px' : '450px'))),
    
    // Spacing
    VERTICAL_SPACING: isMobile ? '15px' : '20px',
    
    // Text input positioning and sizing
    TEXT_INPUT_WIDTH: isMobile ? '60%' : '65%',
    TEXT_INPUT_TOP: '50%',
    TEXT_INPUT_LEFT: isMobile ? '12%' : '9%',
    TEXT_INPUT_FONT_SIZE: isVerySmallMobile ? '14px' : (isSmallMobile ? '16px' : (isMobile ? '18px' : (isSmallScreen ? '24px' : '28px'))),
    
    // Regenerate button positioning and sizing
    REGEN_BUTTON_SIZE: isVerySmallMobile ? '28px' : (isSmallMobile ? '35px' : (isMobile ? '40px' : (isSmallScreen ? '60px' : '80px'))),
    REGEN_BUTTON_RIGHT: isMobile ? '10%' : '6%',
    REGEN_BUTTON_TOP: isMobile ? '50%' : '39%'
  };

  return new Promise((resolve) => {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'username-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    modal.style.zIndex = '2000'; // Higher than other game overlays
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.pointerEvents = 'auto'; // Ensure it captures input
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.textAlign = 'center';
    modalContent.style.display = 'flex';
    modalContent.style.flexDirection = 'column';
    modalContent.style.alignItems = 'center';
    modalContent.style.width = '100%';
    modalContent.style.padding = isMobile ? '10px' : '20px';
    
    // Game title image
    const titleImage = document.createElement('img');
    titleImage.src = '/models/westweltbeta.png';
    titleImage.style.marginBottom = UI_CONSTANTS.VERTICAL_SPACING;
    titleImage.style.maxWidth = UI_CONSTANTS.TITLE_IMAGE_WIDTH;
    
    // Name submit image container
    const nameSubmitContainer = document.createElement('div');
    nameSubmitContainer.style.position = 'relative';
    nameSubmitContainer.style.marginBottom = UI_CONSTANTS.VERTICAL_SPACING;
    nameSubmitContainer.style.width = UI_CONSTANTS.NAME_SUBMIT_WIDTH;
    
    // Name submit image
    const nameSubmitImage = document.createElement('img');
    nameSubmitImage.src = '/models/namesubmit.png';
    nameSubmitImage.style.maxWidth = '100%';
    
    // Input field (positioned on top of namesubmit.png)
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = isMobile ? 'Enter name...' : 'Your name, partner...';
    input.value = playerData.username || generateRandomName();
    input.maxLength = 16; // Restrict input to 16 characters
    input.style.position = 'absolute';
    input.style.top = UI_CONSTANTS.TEXT_INPUT_TOP;
    input.style.left = UI_CONSTANTS.TEXT_INPUT_LEFT;
    input.style.transform = 'translateY(-50%)'; // Only vertical centering
    input.style.width = UI_CONSTANTS.TEXT_INPUT_WIDTH;
    input.style.padding = isMobile ? '4px' : '8px';
    input.style.backgroundColor = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.color = 'white';
    input.style.fontSize = UI_CONSTANTS.TEXT_INPUT_FONT_SIZE;
    input.style.textAlign = 'left'; // Left align text instead of center
    
    // Regenerate button (positioned on the right side of namesubmit.png)
    const regenButton = document.createElement('button');
    regenButton.textContent = ''; // Completely remove the symbol
    regenButton.title = "Generate new name";
    regenButton.style.position = 'absolute';
    regenButton.style.top = UI_CONSTANTS.REGEN_BUTTON_TOP;
    regenButton.style.right = UI_CONSTANTS.REGEN_BUTTON_RIGHT;
    regenButton.style.transform = 'translateY(-50%)';
    regenButton.style.width = UI_CONSTANTS.REGEN_BUTTON_SIZE;
    regenButton.style.height = UI_CONSTANTS.REGEN_BUTTON_SIZE;
    regenButton.style.backgroundColor = 'transparent';
    regenButton.style.color = 'white';
    regenButton.style.border = 'none';
    regenButton.style.borderRadius = '4px';
    regenButton.style.cursor = 'pointer';
    regenButton.style.fontSize = '18px';
    regenButton.style.display = 'flex';
    regenButton.style.justifyContent = 'center';
    regenButton.style.alignItems = 'center';
    
    // Add window resize handler for dynamic adjustments
    const handleResize = () => {
      const newIsMobile = window.innerWidth < 768;
      const newIsSmallMobile = window.innerWidth < 480;
      const newIsVerySmallMobile = window.innerWidth < 360;
      const newIsSmallScreen = window.innerWidth < 1024;
      
      // Update sizes based on new screen dimensions
      const titleWidth = newIsVerySmallMobile ? '260px' : (newIsSmallMobile ? '300px' : (newIsMobile ? '350px' : (newIsSmallScreen ? '400px' : '450px')));
      titleImage.style.maxWidth = titleWidth;
      nameSubmitContainer.style.width = titleWidth;
      enterGameImage.style.maxWidth = titleWidth;
      
      // Update font size
      input.style.fontSize = newIsVerySmallMobile ? '14px' : (newIsSmallMobile ? '16px' : (newIsMobile ? '18px' : (newIsSmallScreen ? '24px' : '28px')));
      input.style.left = newIsMobile ? '12%' : '9%';
      input.style.width = newIsMobile ? '60%' : '65%';
      
      // Update button size
      const buttonSize = newIsVerySmallMobile ? '28px' : (newIsSmallMobile ? '35px' : (newIsMobile ? '40px' : (newIsSmallScreen ? '60px' : '80px')));
      regenButton.style.width = buttonSize;
      regenButton.style.height = buttonSize;
      regenButton.style.right = newIsMobile ? '10%' : '6%';
      regenButton.style.top = newIsMobile ? '50%' : '39%';
    };
    
    window.addEventListener('resize', handleResize);
    
    // Regenerate button click handler
    regenButton.addEventListener('click', () => {
      input.value = generateRandomName();
      input.focus();
    });
    
    // Enter game button image
    const enterGameImage = document.createElement('img');
    enterGameImage.src = '/models/entergame.png';
    enterGameImage.style.maxWidth = UI_CONSTANTS.ENTER_GAME_WIDTH;
    enterGameImage.style.cursor = 'pointer';
    
    // Form handling
    const handleSubmit = () => {
      let username = input.value.trim();
      
      // Client-side validation to prevent XSS attacks
      if (username) {
        // Check for potentially malicious content
        const hasSuspiciousContent = /<[^>]*>|javascript:|on\w+=/i.test(username);
        
        if (hasSuspiciousContent) {
          // Clean the username for safety
          username = username
            .replace(/</g, '')
            .replace(/>/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '');
          
          // Show warning
          input.style.border = '2px solid orange';
          setTimeout(() => {
            input.style.border = 'none';
          }, 2000);
        }
        
        // Limit length
        if (username.length > 16) {
          username = username.substring(0, 16);
        }
        
        playerData.username = username;
        
        // Save immediately after username is set
        const saved = savePlayerIdentity(playerData);
        if (!saved && !playerData.ephemeral) {
          // Mark as ephemeral if save failed
          playerData.ephemeral = true;
          console.warn('Storage unavailable, using ephemeral player identity');
        }
        
        // Animate the modal fading out
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';
        
        setTimeout(() => {
          if (modal.parentNode) {
            document.body.removeChild(modal);
            // Remove resize listener when modal is closed
            window.removeEventListener('resize', handleResize);
          }
          resolve(playerData);
        }, 300);
      } else {
        input.style.border = '2px solid red';
        setTimeout(() => {
          input.style.border = 'none';
        }, 1000);
      }
    };
    
    // Add event listeners
    enterGameImage.addEventListener('click', handleSubmit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    });
    
    // Focus the input field when modal appears
    setTimeout(() => input.focus(), 100);
    
    // Assemble modal
    nameSubmitContainer.appendChild(nameSubmitImage);
    nameSubmitContainer.appendChild(input);
    nameSubmitContainer.appendChild(regenButton);
    
    modalContent.appendChild(titleImage);
    modalContent.appendChild(nameSubmitContainer);
    modalContent.appendChild(enterGameImage);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Add fade-in animation for a smooth appearance
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      modal.style.opacity = '1';
    }, 10);
  });
}

// Prompt to recover saved identity
function promptIdentityRecovery(storedIdentity, newIdentity) {
  return new Promise((resolve) => {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'identity-recovery-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
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
    modalContent.style.maxWidth = '450px';
    modalContent.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.5)';
    modalContent.style.textAlign = 'center';
    
    // Title
    const title = document.createElement('h2');
    title.textContent = 'Welcome Back, Partner!';
    title.style.color = '#f8bb00';
    title.style.marginBottom = '10px';
    title.style.fontFamily = 'Western, serif';
    
    // Message
    const message = document.createElement('p');
    message.textContent = `We found your saved gunslinger, ${storedIdentity.username}. Would you like to continue with this character?`;
    message.style.color = '#fff';
    message.style.marginBottom = '20px';
    
    // Buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.justifyContent = 'center';
    buttonsContainer.style.gap = '15px';
    
    // Yes button
    const yesButton = document.createElement('button');
    yesButton.textContent = 'Yes, continue';
    yesButton.style.padding = '10px 20px';
    yesButton.style.backgroundColor = '#336633';
    yesButton.style.color = '#fff';
    yesButton.style.border = 'none';
    yesButton.style.borderRadius = '4px';
    yesButton.style.cursor = 'pointer';
    yesButton.style.fontWeight = 'bold';
    
    // No button
    const noButton = document.createElement('button');
    noButton.textContent = 'No, start fresh';
    noButton.style.padding = '10px 20px';
    noButton.style.backgroundColor = '#8b0000';
    noButton.style.color = '#fff';
    noButton.style.border = 'none';
    noButton.style.borderRadius = '4px';
    noButton.style.cursor = 'pointer';
    noButton.style.fontWeight = 'bold';
    
    // Button hover effects
    yesButton.onmouseover = () => { yesButton.style.backgroundColor = '#3c7a3c'; };
    yesButton.onmouseout = () => { yesButton.style.backgroundColor = '#336633'; };
    noButton.onmouseover = () => { noButton.style.backgroundColor = '#a00000'; };
    noButton.onmouseout = () => { noButton.style.backgroundColor = '#8b0000'; };
    
    // Button handlers
    yesButton.addEventListener('click', () => {
      document.body.removeChild(modal);
      resolve(storedIdentity);
    });
    
    noButton.addEventListener('click', () => {
      // Clear stored identity when user chooses to start fresh
      try {
        localStorage.removeItem('wildWestPlayerIdentity');
      } catch (e) {
        console.error('Error clearing stored identity:', e);
      }
      document.body.removeChild(modal);
      resolve(newIdentity);
    });
    
    // Assemble modal
    buttonsContainer.appendChild(yesButton);
    buttonsContainer.appendChild(noButton);
    modalContent.appendChild(title);
    modalContent.appendChild(message);
    modalContent.appendChild(buttonsContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  });
}

// Check if there's a stored identity in another storage medium (like localStorage)
// that doesn't match our current session
async function checkForIdentityConflict(currentIdentity) {
  try {
    // Skip conflict resolution in development mode
    if (shouldBypassIdentity() || currentIdentity.devMode) {
      return currentIdentity;
    }
    
    // Only check if our current identity is new (no username yet)
    if (currentIdentity.username) {
      return currentIdentity;
    }
    
    const storedDataStr = localStorage.getItem('wildWestPlayerIdentity');
    if (!storedDataStr) {
      return currentIdentity;
    }
    
    const storedIdentity = JSON.parse(storedDataStr);
    
    // If stored identity has a username and doesn't match our current ID
    if (storedIdentity && 
        storedIdentity.username && 
        storedIdentity.id !== currentIdentity.id) {
      
      // Ask user if they want to recover the stored identity
      return await promptIdentityRecovery(storedIdentity, currentIdentity);
    }
    
    return currentIdentity;
  } catch (e) {
    console.error('Error checking for identity conflict:', e);
    return currentIdentity;
  }
}

// Initialize player identity system
async function initPlayerIdentity() {
  // Get the basic identity first
  let playerData = getPlayerIdentity();
  
  // Check if there's a conflict with stored identity
  playerData = await checkForIdentityConflict(playerData);
  
  // Start preloading game content in background
  preloadGameContent();
  
  // For first-time users, we'll show the username prompt but game continues loading
  const isFirstTime = playerData.createdAt === playerData.lastLogin || shouldBypassIdentity();
  
  if (isFirstTime) {
    // Return a promise that will resolve when the user submits their name
    return new Promise(resolve => {
      // Show username prompt immediately, but don't wait for it
      promptForUsername(playerData).then(updatedPlayerData => {
        // Update last login time and save
        updatedPlayerData.lastLogin = Date.now();
        savePlayerIdentity(updatedPlayerData);
        resolve(updatedPlayerData);
      });
    });
  } else {
    // For returning users, continue normally
    playerData.lastLogin = Date.now();
    savePlayerIdentity(playerData);
    return playerData;
  }
}

// Verify client identity with server
async function verifyIdentityWithServer(playerData) {
  // This would typically make a request to the server to verify the token
  // For now, we'll just simulate this process
  return new Promise(resolve => {
    setTimeout(() => {
      // Assume the verification was successful
      resolve({
        verified: true,
        playerData: playerData
      });
    }, 300);
  });
}

export { 
  initPlayerIdentity,
  getPlayerIdentity, 
  savePlayerIdentity, 
  promptForUsername,
  verifyIdentityWithServer
}; 