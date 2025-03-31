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
    username: devSuffix, // Empty string or dev suffix
    createdAt: Date.now(),
    lastLogin: Date.now(),
    ephemeral: ephemeral, // Flag for when storage isn't available
    devMode: shouldBypassIdentity() // Flag to mark dev identities
  };
  
  console.log('Created new player identity');
  return newIdentity;
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
  const progressBar = document.createElement('div');
  progressBar.className = 'preload-progress';
  progressBar.style.position = 'absolute';
  progressBar.style.bottom = '10px';
  progressBar.style.left = '10%';
  progressBar.style.width = '80%';
  progressBar.style.height = '4px';
  progressBar.style.backgroundColor = '#333';
  progressBar.style.borderRadius = '2px';
  progressBar.style.overflow = 'hidden';
  
  const progressFill = document.createElement('div');
  progressFill.style.height = '100%';
  progressFill.style.width = '0%';
  progressFill.style.backgroundColor = '#f8bb00';
  progressFill.style.transition = 'width 0.5s ease';
  progressBar.appendChild(progressFill);
  
  const progressText = document.createElement('div');
  progressText.style.position = 'absolute';
  progressText.style.bottom = '16px';
  progressText.style.left = '10%';
  progressText.style.width = '80%';
  progressText.style.textAlign = 'center';
  progressText.style.fontSize = '12px';
  progressText.style.color = '#999';
  progressText.textContent = 'Preparing your adventure...';
  
  // Add progress elements to first modal we find
  setTimeout(() => {
    const modal = document.querySelector('.username-modal');
    if (modal) {
      const modalContent = modal.querySelector('div');
      if (modalContent) {
        modalContent.appendChild(progressBar);
        modalContent.appendChild(progressText);
      }
    }
  }, 100);
  
  // Apply blur effect to the background
  // Create a scene in the background to render while user enters name
  createPreviewScene();
  
  // Start preloading assets in background
  console.log("Starting background preload of game content...");
  
  return new Promise((resolve) => {
    // Preload textures - only include files that actually exist
    const textureURLs = [
      'models/skypart.png',
      'models/groundpart.png'
    ];
    
    // Preload sounds
    const soundURLs = [
      'sounds/shot.mp3',
      'sounds/aimclick.mp3',
      'sounds/shellejection.mp3',
      'sounds/reloading.mp3',
      'sounds/bellstart.mp3',
      'sounds/woodimpact.mp3',
      'sounds/fleshimpact.mp3',
      'sounds/leftstep.mp3',
      'sounds/rightstep.mp3',
      'sounds/jump.mp3',
      'sounds/headshotmarker.mp3'
    ];
    
    // Preload 3D models - only include files that actually exist
    const modelURLs = [
      'models/town.glb',
      'models/viewmodel.glb',
      'models/playermodel.glb'
    ];
    
    // Track loading progress
    const totalItems = textureURLs.length + soundURLs.length + modelURLs.length;
    let loadedItems = 0;
    
    function updateProgress() {
      loadedItems++;
      const progress = Math.min(100, Math.round((loadedItems / totalItems) * 100));
      progressFill.style.width = `${progress}%`;
      
      if (loadedItems >= totalItems) {
        progressText.textContent = 'Ready to play!';
        progressFill.style.backgroundColor = '#4CAF50';
        resolve();
      }
    }
    
    // Load textures
    const textureLoader = new THREE.TextureLoader();
    textureURLs.forEach(url => {
      textureLoader.load(url, 
        (texture) => {
          // Store texture in window cache for faster access later
          if (!window.preloadedTextures) window.preloadedTextures = {};
          const textureName = url.split('/').pop().split('.')[0];
          window.preloadedTextures[textureName] = texture;
          updateProgress();
        },
        null, // Progress callback
        (err) => { console.error(`Error loading texture ${url}:`, err); updateProgress(); } // Error
      );
    });
    
    // Load sounds
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    soundURLs.forEach(url => {
      fetch(url)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(audioBuffer => {
          // Store audio in window cache
          if (!window.preloadedAudio) window.preloadedAudio = {};
          const soundName = url.split('/').pop().split('.')[0];
          window.preloadedAudio[soundName] = audioBuffer;
          updateProgress();
        })
        .catch(err => { console.error(`Error loading sound ${url}:`, err); updateProgress(); });
    });
    
    // Load models
    const modelLoader = new THREE.GLTFLoader();
    modelURLs.forEach(url => {
      modelLoader.load(url, 
        (gltf) => {
          // Store model reference in window cache
          if (!window.preloadedModels) window.preloadedModels = {};
          const modelName = url.split('/').pop().split('.')[0];
          window.preloadedModels[modelName] = gltf;
          
          // Clone model object and save a reference the cloned model
          // This prevents the model from being reloaded again later
          window.preloadedModels[`${modelName}_clone`] = {
            scene: gltf.scene.clone(),
            animations: gltf.animations,
          };
          
          // If this is the town model, create a preview scene
          if (modelName === 'town') {
            updatePreviewScene(gltf);
          }
          
          updateProgress();
        },
        (xhr) => {
          // Report loading progress for large models
          if (xhr.lengthComputable) {
            const percentComplete = xhr.loaded / xhr.total * 100;
            console.log(`${url}: ${Math.round(percentComplete)}% loaded`);
          }
        },
        (err) => { console.error(`Error loading model ${url}:`, err); updateProgress(); } // Error
      );
    });
    
    // Initialize dummy scene to compile shaders
    const dummyScene = new THREE.Scene();
    const dummyCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const dummyRenderer = new THREE.WebGLRenderer({ antialias: true });
    dummyRenderer.setSize(1, 1);
    dummyRenderer.render(dummyScene, dummyCamera);
    
    // Cleanup dummy renderer after use
    setTimeout(() => {
      dummyRenderer.dispose();
    }, 2000);
  });
}

// Create a preview scene to render behind the name dialog
function createPreviewScene() {
  // Check if we already have a container for the game
  const gameContainer = document.getElementById('game-container');
  if (!gameContainer) {
    // Create a container for the game if it doesn't exist
    const container = document.createElement('div');
    container.id = 'game-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '1';
    container.style.filter = 'blur(8px)';
    document.body.appendChild(container);
  } else {
    // If container exists, just add blur effect
    gameContainer.style.filter = 'blur(8px)';
  }
  
  // Create a minimal Three.js scene for background preview
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xec9e5c); // Desert color
  
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  gameContainer.appendChild(renderer.domElement);
  
  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffebc8, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffb3, 1.0);
  directionalLight.position.set(1, 1.2, 0.5).normalize();
  scene.add(directionalLight);
  
  // Add fog
  const desertFogColor = new THREE.Color(0xec9e5c);
  scene.fog = new THREE.Fog(desertFogColor, 250, 900);
  
  // Store in window for updating later when town model loads
  window.previewScene = {
    scene,
    camera,
    renderer
  };

  // Set a flag to control animation loop
  window.previewSceneActive = true;
  
  // Start rendering loop
  function animate() {
    if (!window.previewSceneActive || !window.previewScene) return;
    
    requestAnimationFrame(animate);
    
    // Gently move camera for a slight effect
    const time = Date.now() * 0.0005;
    camera.position.x = Math.sin(time) * 15;
    camera.position.z = Math.cos(time) * 15;
    camera.lookAt(0, 0, 0);
    
    renderer.render(scene, camera);
  }
  
  animate();
  
  // Handle window resize
  function onWindowResize() {
    if (!window.previewScene) return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    window.previewScene.camera.aspect = width / height;
    window.previewScene.camera.updateProjectionMatrix();
    window.previewScene.renderer.setSize(width, height);
  }
  
  window.addEventListener('resize', onWindowResize);
}

// Update the preview scene with loaded town model
function updatePreviewScene(gltf) {
  if (!window.previewScene || !window.previewScene.scene) return;
  
  // Create a clone of the model to avoid reference issues
  const townClone = gltf.scene.clone();
  
  // Add to preview scene
  window.previewScene.scene.add(townClone);
  
  // Adjust camera to get a good view of the town
  window.previewScene.camera.position.set(30, 20, 30);
  window.previewScene.camera.lookAt(0, 0, 0);
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
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
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
        
        // Save immediately after username is set
        const saved = savePlayerIdentity(playerData);
        if (!saved && !playerData.ephemeral) {
          // Mark as ephemeral if save failed
          playerData.ephemeral = true;
          console.warn('Storage unavailable, using ephemeral player identity');
        }
        
        // Remove blur from game container
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
          gameContainer.style.filter = 'none';
        }
        
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
  
  // If no username, prompt for one
  if (!playerData.username) {
    playerData = await promptForUsername(playerData);
  }
  
  // Update last login time and save again
  playerData.lastLogin = Date.now();
  savePlayerIdentity(playerData);
  
  return playerData;
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