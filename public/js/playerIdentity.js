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
        savePlayerIdentity(playerData);
        
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
    
    // Start preloading content in the background for first-time users
    if (!playerData.username) {
      preloadGameContent();
    }
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
  promptForUsername,
  preloadGameContent 
}; 