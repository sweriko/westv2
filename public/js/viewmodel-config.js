/**
 * Viewmodel Configuration Helper
 * Allows runtime adjustment of viewmodel position and scale
 */

// Disable debug mode for production
window.debugMode = false;

// Initialize viewmodel configuration when window loads
window.addEventListener('load', () => {
  // Check if we're in debug mode
  if (!window.debugMode) return;
  
  createViewmodelConfigUI();
});

/**
 * Creates a UI panel for configuring the viewmodel
 */
function createViewmodelConfigUI() {
  // Create container
  const container = document.createElement('div');
  container.id = 'viewmodel-config';
  container.style.position = 'fixed';
  container.style.top = '10px';
  container.style.right = '10px';
  container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  container.style.color = 'white';
  container.style.padding = '10px';
  container.style.borderRadius = '5px';
  container.style.zIndex = '1000';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '12px';
  container.style.width = '200px';
  
  // Create title
  const title = document.createElement('div');
  title.textContent = 'Viewmodel Config';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '10px';
  title.style.textAlign = 'center';
  container.appendChild(title);
  
  // Minimize button
  const minimizeBtn = document.createElement('button');
  minimizeBtn.textContent = '-';
  minimizeBtn.style.position = 'absolute';
  minimizeBtn.style.top = '5px';
  minimizeBtn.style.right = '5px';
  minimizeBtn.style.width = '20px';
  minimizeBtn.style.height = '20px';
  minimizeBtn.style.padding = '0';
  minimizeBtn.style.border = 'none';
  minimizeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
  minimizeBtn.style.cursor = 'pointer';
  container.appendChild(minimizeBtn);
  
  // Controls content
  const content = document.createElement('div');
  content.id = 'viewmodel-config-content';
  container.appendChild(content);
  
  // Add controls
  addFOVControl(content);
  addScaleControl(content);
  addPositionControls(content);
  addRotationControls(content);
  addEffectControls(content);
  
  // Apply/Reset buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'space-between';
  buttonContainer.style.marginTop = '10px';
  
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset';
  resetBtn.style.padding = '5px 10px';
  resetBtn.addEventListener('click', resetViewmodelConfig);
  
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy JSON';
  copyBtn.style.padding = '5px 10px';
  copyBtn.addEventListener('click', copyConfigAsJSON);
  
  buttonContainer.appendChild(resetBtn);
  buttonContainer.appendChild(copyBtn);
  content.appendChild(buttonContainer);
  
  // Add to document
  document.body.appendChild(container);
  
  // Add minimize functionality
  let isMinimized = false;
  minimizeBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    content.style.display = isMinimized ? 'none' : 'block';
    minimizeBtn.textContent = isMinimized ? '+' : '-';
    container.style.width = isMinimized ? 'auto' : '200px';
  });
}

/**
 * Adds FOV control to the config panel
 */
function addFOVControl(parent) {
  const container = document.createElement('div');
  container.style.marginBottom = '10px';
  
  const label = document.createElement('div');
  label.textContent = 'FOV';
  container.appendChild(label);
  
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '60';
  input.max = '120';
  input.step = '1';
  input.style.width = '100%';
  input.id = 'camera-fov';
  
  // Set initial value if player exists
  if (window.localPlayer && window.localPlayer.camera) {
    input.value = window.localPlayer.camera.fov;
  } else {
    input.value = 90;
  }
  
  input.addEventListener('input', () => {
    if (window.localPlayer && window.localPlayer.camera) {
      const fov = parseFloat(input.value);
      window.localPlayer.camera.fov = fov;
      window.localPlayer.camera.updateProjectionMatrix();
      updateValueDisplay('fov-value', fov.toFixed(0));
    }
  });
  
  container.appendChild(input);
  
  // Value display
  const valueDisplay = document.createElement('div');
  valueDisplay.id = 'fov-value';
  valueDisplay.textContent = input.value;
  valueDisplay.style.textAlign = 'right';
  valueDisplay.style.fontSize = '10px';
  container.appendChild(valueDisplay);
  
  parent.appendChild(container);
}

/**
 * Adds scale control to the config panel
 */
function addScaleControl(parent) {
  const container = document.createElement('div');
  container.style.marginBottom = '10px';
  
  const label = document.createElement('div');
  label.textContent = 'Scale';
  container.appendChild(label);
  
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0.01';
  input.max = '1.0';
  input.step = '0.01';
  input.style.width = '100%';
  input.id = 'viewmodel-scale';
  
  // Set initial value if player exists
  if (window.localPlayer && window.localPlayer.viewmodel) {
    input.value = window.localPlayer.viewmodel.SCALE;
  } else {
    input.value = 0.05;
  }
  
  input.addEventListener('input', () => {
    if (window.localPlayer && window.localPlayer.viewmodel) {
      const scale = parseFloat(input.value);
      window.localPlayer.viewmodel.SCALE = scale;
      window.localPlayer.viewmodel.group.scale.set(scale, scale, scale);
      updateValueDisplay('scale-value', scale.toFixed(3));
    }
  });
  
  container.appendChild(input);
  
  // Value display
  const valueDisplay = document.createElement('div');
  valueDisplay.id = 'scale-value';
  valueDisplay.textContent = input.value;
  valueDisplay.style.textAlign = 'right';
  valueDisplay.style.fontSize = '10px';
  container.appendChild(valueDisplay);
  
  parent.appendChild(container);
}

/**
 * Adds position controls to the config panel
 */
function addPositionControls(parent) {
  const container = document.createElement('div');
  container.style.marginBottom = '10px';
  
  const label = document.createElement('div');
  label.textContent = 'Position';
  container.appendChild(label);
  
  // X, Y, Z controls
  const axes = ['x', 'y', 'z'];
  axes.forEach(axis => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.marginBottom = '5px';
    
    const axisLabel = document.createElement('div');
    axisLabel.textContent = axis.toUpperCase();
    axisLabel.style.width = '20px';
    row.appendChild(axisLabel);
    
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '-3';
    input.max = '3';
    input.step = '0.05';
    input.style.flexGrow = '1';
    input.id = `viewmodel-pos-${axis}`;
    
    // Set initial value if player exists
    if (window.localPlayer && window.localPlayer.viewmodel) {
      if (axis === 'z') {
        // Z position includes forward clip
        input.value = window.localPlayer.viewmodel.group.position[axis] - 
                      window.localPlayer.viewmodel.FORWARD_CLIP;
      } else {
        input.value = window.localPlayer.viewmodel.group.position[axis];
      }
    } else {
      input.value = 0;
    }
    
    input.addEventListener('input', () => {
      if (window.localPlayer && window.localPlayer.viewmodel) {
        const position = parseFloat(input.value);
        
        // Update viewmodel object
        window.localPlayer.viewmodel.POSITION[axis] = position;
        
        // Update actual position in scene
        if (axis === 'z') {
          // Add forward clip for z-axis
          window.localPlayer.viewmodel.group.position[axis] = 
            position + window.localPlayer.viewmodel.FORWARD_CLIP;
        } else {
          window.localPlayer.viewmodel.group.position[axis] = position;
        }
        
        updateValueDisplay(`pos-${axis}-value`, position.toFixed(2));
      }
    });
    
    row.appendChild(input);
    
    // Value display
    const valueDisplay = document.createElement('div');
    valueDisplay.id = `pos-${axis}-value`;
    valueDisplay.textContent = input.value;
    valueDisplay.style.width = '40px';
    valueDisplay.style.textAlign = 'right';
    valueDisplay.style.fontSize = '10px';
    row.appendChild(valueDisplay);
    
    container.appendChild(row);
  });
  
  parent.appendChild(container);
}

/**
 * Adds rotation controls to the config panel
 */
function addRotationControls(parent) {
  const container = document.createElement('div');
  container.style.marginBottom = '10px';
  
  const label = document.createElement('div');
  label.textContent = 'Rotation';
  container.appendChild(label);
  
  // X, Y, Z controls
  const axes = ['x', 'y', 'z'];
  axes.forEach(axis => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.marginBottom = '5px';
    
    const axisLabel = document.createElement('div');
    axisLabel.textContent = axis.toUpperCase();
    axisLabel.style.width = '20px';
    row.appendChild(axisLabel);
    
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '-3.14';
    input.max = '3.14';
    input.step = '0.05';
    input.style.flexGrow = '1';
    input.id = `viewmodel-rot-${axis}`;
    
    // Set initial value if player exists
    if (window.localPlayer && window.localPlayer.viewmodel) {
      input.value = window.localPlayer.viewmodel.group.rotation[axis];
    } else {
      input.value = 0;
    }
    
    input.addEventListener('input', () => {
      if (window.localPlayer && window.localPlayer.viewmodel) {
        const rotation = parseFloat(input.value);
        
        // Update viewmodel object
        window.localPlayer.viewmodel.ROTATION[axis] = rotation;
        window.localPlayer.viewmodel.group.rotation[axis] = rotation;
        
        updateValueDisplay(`rot-${axis}-value`, rotation.toFixed(2));
      }
    });
    
    row.appendChild(input);
    
    // Value display
    const valueDisplay = document.createElement('div');
    valueDisplay.id = `rot-${axis}-value`;
    valueDisplay.textContent = input.value;
    valueDisplay.style.width = '40px';
    valueDisplay.style.textAlign = 'right';
    valueDisplay.style.fontSize = '10px';
    row.appendChild(valueDisplay);
    
    container.appendChild(row);
  });
  
  parent.appendChild(container);
}

/**
 * Adds effect position controls
 */
function addEffectControls(parent) {
  const container = document.createElement('div');
  
  const label = document.createElement('div');
  label.textContent = 'Muzzle Flash';
  container.appendChild(label);
  
  // X, Y, Z controls for muzzle flash
  const axes = ['x', 'y', 'z'];
  axes.forEach(axis => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.marginBottom = '5px';
    
    const axisLabel = document.createElement('div');
    axisLabel.textContent = axis.toUpperCase();
    axisLabel.style.width = '20px';
    row.appendChild(axisLabel);
    
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '-10';
    input.max = '10';
    input.step = '0.1';
    input.style.flexGrow = '1';
    input.id = `muzzle-${axis}`;
    
    // Set initial value if player exists
    if (window.localPlayer && window.localPlayer.viewmodel) {
      input.value = window.localPlayer.viewmodel.EFFECTS.MUZZLE_FLASH[axis];
    } else {
      input.value = axis === 'z' ? -1.67 : (axis === 'x' ? 0.33 : -0.17);
    }
    
    input.addEventListener('input', () => {
      if (window.localPlayer && window.localPlayer.viewmodel) {
        const position = parseFloat(input.value);
        
        // Update viewmodel object
        window.localPlayer.viewmodel.EFFECTS.MUZZLE_FLASH[axis] = position;
        
        // Update actual position if muzzle anchor exists
        if (window.localPlayer.viewmodel.muzzleFlashAnchor) {
          window.localPlayer.viewmodel.muzzleFlashAnchor.position[axis] = position;
        }
        
        updateValueDisplay(`muzzle-${axis}-value`, position.toFixed(2));
      }
    });
    
    row.appendChild(input);
    
    // Value display
    const valueDisplay = document.createElement('div');
    valueDisplay.id = `muzzle-${axis}-value`;
    valueDisplay.textContent = input.value;
    valueDisplay.style.width = '40px';
    valueDisplay.style.textAlign = 'right';
    valueDisplay.style.fontSize = '10px';
    row.appendChild(valueDisplay);
    
    container.appendChild(row);
  });
  
  parent.appendChild(container);
}

/**
 * Updates a value display element
 */
function updateValueDisplay(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

/**
 * Resets all viewmodel configuration to defaults
 */
function resetViewmodelConfig() {
  if (!window.localPlayer || !window.localPlayer.viewmodel) return;
  
  const viewmodel = window.localPlayer.viewmodel;
  
  // Reset FOV
  if (window.localPlayer.camera) {
    window.localPlayer.camera.fov = 90;
    window.localPlayer.camera.updateProjectionMatrix();
  }
  
  // Reset scale
  viewmodel.SCALE = 1.0;
  viewmodel.group.scale.set(1.0, 1.0, 1.0);
  
  // Reset position
  viewmodel.POSITION = { x: 0, y: 0, z: -0.5 };
  viewmodel.group.position.set(0, 0, -0.5 + viewmodel.FORWARD_CLIP);
  
  // Reset rotation
  viewmodel.ROTATION = { x: 0, y: 0, z: 0 };
  viewmodel.group.rotation.set(0, 0, 0);
  
  // Reset muzzle flash position
  viewmodel.EFFECTS.MUZZLE_FLASH = {
    x: 0.33,
    y: -0.17,
    z: -1.67,
    scale: 0.1
  };
  
  if (viewmodel.muzzleFlashAnchor) {
    viewmodel.muzzleFlashAnchor.position.set(0.33, -0.17, -1.67);
  }
  
  // Update all input fields to match the reset values
  updateConfigInputs();
}

/**
 * Updates all input fields to match current values
 */
function updateConfigInputs() {
  if (!window.localPlayer || !window.localPlayer.viewmodel) return;
  
  const viewmodel = window.localPlayer.viewmodel;
  
  // Update FOV input
  const fovInput = document.getElementById('camera-fov');
  if (fovInput && window.localPlayer.camera) {
    fovInput.value = window.localPlayer.camera.fov;
    updateValueDisplay('fov-value', window.localPlayer.camera.fov.toFixed(0));
  }
  
  // Update scale input
  const scaleInput = document.getElementById('viewmodel-scale');
  if (scaleInput) {
    scaleInput.value = viewmodel.SCALE;
    updateValueDisplay('scale-value', viewmodel.SCALE.toFixed(3));
  }
  
  // Update position inputs
  ['x', 'y', 'z'].forEach(axis => {
    const input = document.getElementById(`viewmodel-pos-${axis}`);
    if (input) {
      const value = axis === 'z' ? 
        viewmodel.group.position[axis] - viewmodel.FORWARD_CLIP : 
        viewmodel.group.position[axis];
      
      input.value = value;
      updateValueDisplay(`pos-${axis}-value`, value.toFixed(2));
    }
  });
  
  // Update rotation inputs
  ['x', 'y', 'z'].forEach(axis => {
    const input = document.getElementById(`viewmodel-rot-${axis}`);
    if (input) {
      input.value = viewmodel.group.rotation[axis];
      updateValueDisplay(`rot-${axis}-value`, viewmodel.group.rotation[axis].toFixed(2));
    }
  });
  
  // Update muzzle flash inputs
  ['x', 'y', 'z'].forEach(axis => {
    const input = document.getElementById(`muzzle-${axis}`);
    if (input) {
      input.value = viewmodel.EFFECTS.MUZZLE_FLASH[axis];
      updateValueDisplay(`muzzle-${axis}-value`, viewmodel.EFFECTS.MUZZLE_FLASH[axis].toFixed(2));
    }
  });
}

/**
 * Copies the current viewmodel configuration as JSON
 */
function copyConfigAsJSON() {
  if (!window.localPlayer || !window.localPlayer.viewmodel) return;
  
  const viewmodel = window.localPlayer.viewmodel;
  
  const config = {
    FOV: window.localPlayer.camera ? window.localPlayer.camera.fov : 90,
    SCALE: viewmodel.SCALE,
    POSITION: {
      x: viewmodel.POSITION.x,
      y: viewmodel.POSITION.y,
      z: viewmodel.POSITION.z
    },
    ROTATION: {
      x: viewmodel.ROTATION.x,
      y: viewmodel.ROTATION.y,
      z: viewmodel.ROTATION.z
    },
    FORWARD_CLIP: viewmodel.FORWARD_CLIP,
    EFFECTS: {
      MUZZLE_FLASH: {
        x: viewmodel.EFFECTS.MUZZLE_FLASH.x,
        y: viewmodel.EFFECTS.MUZZLE_FLASH.y,
        z: viewmodel.EFFECTS.MUZZLE_FLASH.z,
        scale: viewmodel.EFFECTS.MUZZLE_FLASH.scale
      },
      SMOKE_RING: viewmodel.EFFECTS.SMOKE_RING,
      BULLET_SPAWN: viewmodel.EFFECTS.BULLET_SPAWN
    }
  };
  
  const json = JSON.stringify(config, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    console.log('Viewmodel config copied to clipboard');
    
    // Flash the copy button to indicate success
    const copyBtn = document.querySelector('#viewmodel-config button:nth-child(2)');
    if (copyBtn) {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy JSON';
      }, 1000);
    }
  });
} 