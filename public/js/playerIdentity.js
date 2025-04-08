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
  let preloadProgress = 0;
  
  // Create a container for progress elements
  const progressContainer = document.createElement('div');
  progressContainer.className = 'preload-progress-container';
  progressContainer.style.width = '100%';
  progressContainer.style.marginTop = '20px';
  
  // Create progress bar with western-themed styling
  const progressBar = document.createElement('div');
  progressBar.className = 'preload-progress';
  progressBar.style.position = 'relative';
  progressBar.style.width = '100%';
  progressBar.style.height = '8px';
  progressBar.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
  progressBar.style.borderRadius = '4px';
  progressBar.style.overflow = 'hidden';
  progressBar.style.border = '1px solid #8b4513';
  
  const progressFill = document.createElement('div');
  progressFill.style.height = '100%';
  progressFill.style.width = '0%';
  progressFill.style.backgroundColor = '#8b0000';
  progressFill.style.transition = 'width 0.5s ease';
  progressBar.appendChild(progressFill);
  
  const progressText = document.createElement('div');
  progressText.style.position = 'relative';
  progressText.style.marginTop = '10px';
  progressText.style.width = '100%';
  progressText.style.textAlign = 'center';
  progressText.style.fontSize = '14px';
  progressText.style.color = '#d4a45f';
  progressText.style.fontFamily = 'Western, serif';
  progressText.textContent = 'Loading your adventure...';
  
  // Add bullet icon decorations
  const leftBullet = document.createElement('div');
  leftBullet.innerHTML = '&#x1F4A5;'; // Explosion emoji as bullet
  leftBullet.style.position = 'absolute';
  leftBullet.style.left = '-25px';
  leftBullet.style.top = '50%';
  leftBullet.style.transform = 'translateY(-50%)';
  leftBullet.style.fontSize = '16px';
  
  const rightBullet = document.createElement('div');
  rightBullet.innerHTML = '&#x1F4A5;';
  rightBullet.style.position = 'absolute';
  rightBullet.style.right = '-25px';
  rightBullet.style.top = '50%';
  rightBullet.style.transform = 'translateY(-50%)';
  rightBullet.style.fontSize = '16px';
  
  progressContainer.appendChild(progressBar);
  progressContainer.appendChild(progressText);
  
  // Add progress elements to modal when it appears
  const checkForModal = setInterval(() => {
    const modal = document.querySelector('.username-modal');
    if (modal) {
      const modalContent = modal.querySelector('div');
      if (modalContent) {
        modalContent.appendChild(progressContainer);
        clearInterval(checkForModal);
      }
    }
  }, 100);
  
  // Loading messages to cycle through
  const loadingMessages = [
    "Saddling up the horses...",
    "Polishing six-shooters...",
    "Filling up whiskey barrels...",
    "Dusting off the tumbleweed...",
    "Waking up the sheriff...",
    "Loading bullets...",
    "Cleaning up the saloon...",
    "Setting up the poker table...",
    "Preparing the town for your arrival..."
  ];
  
  // Function to update progress with a more interesting flow
  const updateProgress = () => {
    // Generate some random progress increment
    const increment = Math.random() * 5 + 2;
    preloadProgress += increment;
    
    // Cap at 90% - we'll go to 100% when everything is actually loaded
    if (preloadProgress > 90) {
      preloadProgress = 90 + (Math.random() * 2);
    }
    
    // Update progress bar
    progressFill.style.width = `${preloadProgress}%`;
    
    // Change message occasionally
    if (Math.random() > 0.7) {
      const randomMessageIndex = Math.floor(Math.random() * loadingMessages.length);
      progressText.textContent = loadingMessages[randomMessageIndex];
    }
    
    // Continue updating until we hit near 100%
    if (preloadProgress < 95) {
      setTimeout(updateProgress, Math.random() * 600 + 400);
    } else {
      progressText.textContent = "Ready to enter the saloon!";
    }
  };
  
  // Start progress updates
  setTimeout(updateProgress, 500);
  
  console.log("Starting background preload of game content...");
  // Actual preloading happens in parallel in main.js
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
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    modal.style.zIndex = '2000'; // Higher than other game overlays
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.pointerEvents = 'auto'; // Ensure it captures input
    
    // Create modal content with western styling
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#2c2c2c';
    modalContent.style.borderRadius = '8px';
    modalContent.style.border = '3px solid #8b4513'; // Brown border for wooden look
    modalContent.style.padding = '25px';
    modalContent.style.width = '90%';
    modalContent.style.maxWidth = '450px';
    modalContent.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.7)';
    modalContent.style.textAlign = 'center';
    modalContent.style.backgroundImage = 'url("/textures/paper_texture.png")'; // Optional: use paper texture if available
    modalContent.style.backgroundSize = 'cover';
    
    // Logo/branding (optional)
    const logo = document.createElement('div');
    logo.style.fontFamily = 'Western, serif';
    logo.style.fontSize = '24px';
    logo.style.color = '#8b0000';
    logo.style.marginBottom = '15px';
    logo.textContent = 'WEST V2';
    
    // Title
    const title = document.createElement('h2');
    title.textContent = 'Enter Your Gunslinger Name';
    title.style.color = '#8b0000'; // Deep red color
    title.style.marginBottom = '20px';
    title.style.fontFamily = 'Western, serif';
    title.style.textShadow = '1px 1px 2px rgba(0,0,0,0.3)';
    
    // Input container (to hold input + regenerate button side by side)
    const inputContainer = document.createElement('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.marginBottom = '25px';
    inputContainer.style.gap = '8px';
    
    // Input field
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Your name, partner...';
    // Use generated name if no name exists yet
    input.value = playerData.username || generateRandomName();
    input.style.padding = '12px';
    input.style.width = '100%';
    input.style.borderRadius = '4px';
    input.style.border = '1px solid #8b4513';
    input.style.backgroundColor = 'rgba(51, 51, 51, 0.8)';
    input.style.color = '#fff';
    input.style.boxSizing = 'border-box';
    input.style.fontSize = '16px';
    
    // Regenerate button
    const regenButton = document.createElement('button');
    regenButton.innerHTML = '&#x21bb;'; // Refresh symbol
    regenButton.title = "Generate new name";
    regenButton.style.padding = '0 15px';
    regenButton.style.backgroundColor = '#555';
    regenButton.style.color = '#fff';
    regenButton.style.border = '1px solid #444';
    regenButton.style.borderRadius = '4px';
    regenButton.style.cursor = 'pointer';
    regenButton.style.fontSize = '18px';
    
    // Add hover effect for regen button
    regenButton.onmouseover = () => {
      regenButton.style.backgroundColor = '#666';
    };
    regenButton.onmouseout = () => {
      regenButton.style.backgroundColor = '#555';
    };
    
    // Regenerate button click handler
    regenButton.addEventListener('click', () => {
      input.value = generateRandomName();
      input.focus();
    });
    
    // Submit button
    const button = document.createElement('button');
    button.textContent = 'Enter the Saloon';
    button.style.padding = '12px 20px';
    button.style.backgroundColor = '#8b0000';
    button.style.color = '#fff';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    button.style.width = '100%';
    button.style.fontFamily = 'Western, serif';
    button.style.fontSize = '18px';
    button.style.transition = 'background-color 0.2s';
    
    // Hover effect
    button.onmouseover = () => {
      button.style.backgroundColor = '#a00000';
    };
    button.onmouseout = () => {
      button.style.backgroundColor = '#8b0000';
    };
    
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
            input.style.border = '1px solid #8b4513';
          }, 2000);
        }
        
        // Limit length
        if (username.length > 20) {
          username = username.substring(0, 20);
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
          }
          resolve(playerData);
        }, 300);
      } else {
        input.style.border = '2px solid red';
        setTimeout(() => {
          input.style.border = '1px solid #8b4513';
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
    inputContainer.appendChild(input);
    inputContainer.appendChild(regenButton);
    modalContent.appendChild(logo);
    modalContent.appendChild(title);
    modalContent.appendChild(inputContainer);
    modalContent.appendChild(button);
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