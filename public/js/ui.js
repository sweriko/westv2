/**
 * Updates the ammo counter in the UI.
 * @param {Player} player - The player instance.
 */
export function updateAmmoUI(player) {
  const ammoCounter = document.getElementById('ammo-counter');
  if (ammoCounter && player) {
    ammoCounter.textContent = `Bullets: ${player.bullets}/${player.maxBullets}`;
  }
}

/**
* Updates the health counter in the UI.
* @param {Player|ThirdPersonModel} player - The player instance.
*/
export function updateHealthUI(player) {
  const healthCounter = document.getElementById('health-counter');
  if (healthCounter && player) {
    const healthText = `Health: ${player.health}`;
    healthCounter.textContent = healthText;
    
    // Add visual indication of health level
    if (player.health > 75) {
      healthCounter.style.color = '#4CAF50'; // Green for good health
    } else if (player.health > 30) {
      healthCounter.style.color = '#FFC107'; // Yellow/amber for medium health
    } else {
      healthCounter.style.color = '#F44336'; // Red for low health
    }
  }
}

/**
* Shows a damage indicator when the player takes damage.
* @param {number} damage - The amount of damage taken.
* @param {string} hitZone - The hit zone ('head', 'body', 'limbs').
*/
export function showDamageIndicator(damage, hitZone) {
  // Use static variables to track combined damage
  if (!showDamageIndicator.lastTime) {
    showDamageIndicator.lastTime = 0;
    showDamageIndicator.combinedDamage = 0;
    showDamageIndicator.lastHitZone = null;
    showDamageIndicator.pendingTimeoutId = null;
  }
  
  const now = performance.now();
  const timeSinceLastHit = now - showDamageIndicator.lastTime;
  
  // If this hit is within 50ms of the previous one (shotgun pellets typically arrive together),
  // or it's the same hit zone, combine the damage
  if (timeSinceLastHit < 50 || (hitZone === showDamageIndicator.lastHitZone && timeSinceLastHit < 150)) {
    // Add to the combined damage
    showDamageIndicator.combinedDamage += damage;
    showDamageIndicator.lastTime = now;
    showDamageIndicator.lastHitZone = hitZone;
    
    // Clear any pending timeout
    if (showDamageIndicator.pendingTimeoutId) {
      clearTimeout(showDamageIndicator.pendingTimeoutId);
    }
    
    // Set a new timeout to show the combined damage
    showDamageIndicator.pendingTimeoutId = setTimeout(() => {
      displayDamageIndicator(showDamageIndicator.combinedDamage, showDamageIndicator.lastHitZone);
      // Reset the tracking variables
      showDamageIndicator.combinedDamage = 0;
      showDamageIndicator.pendingTimeoutId = null;
    }, 50);
  } else {
    // This is a new hit, not part of a shotgun blast, show it immediately
    showDamageIndicator.lastTime = now;
    showDamageIndicator.lastHitZone = hitZone;
    showDamageIndicator.combinedDamage = damage;
    
    displayDamageIndicator(damage, hitZone);
  }
}

/**
* Helper function to display the damage indicator UI element
* @param {number} damage - The amount of damage to display
* @param {string} hitZone - The hit zone ('head', 'body', 'limbs')
*/
function displayDamageIndicator(damage, hitZone) {
  // Create damage indicator element if it doesn't exist
  let damageIndicator = document.getElementById('damage-indicator');
  if (!damageIndicator) {
      damageIndicator = document.createElement('div');
      damageIndicator.id = 'damage-indicator';
      damageIndicator.style.position = 'absolute';
      damageIndicator.style.top = '40%';
      damageIndicator.style.left = '50%';
      damageIndicator.style.transform = 'translate(-50%, -50%)';
      damageIndicator.style.color = 'red';
      damageIndicator.style.fontSize = '48px';
      damageIndicator.style.fontWeight = 'bold';
      damageIndicator.style.opacity = '0';
      damageIndicator.style.textShadow = '2px 2px 4px #000000';
      damageIndicator.style.transition = 'opacity 0.3s ease-in, opacity 0.5s ease-out';
      damageIndicator.style.zIndex = '1000';
      damageIndicator.style.pointerEvents = 'none';
      document.getElementById('game-container').appendChild(damageIndicator);
  }
  
  // Set text based on hit zone
  let hitText = `-${damage}`;
  if (hitZone) {
      switch (hitZone) {
          case 'head':
              hitText += ' HEADSHOT!';
              break;
          case 'body':
              hitText += ' (Body Shot)';
              break;
          case 'limbs':
              hitText += ' (Limb Shot)';
              break;
      }
  }
  
  // Display damage indicator
  damageIndicator.textContent = hitText;
  damageIndicator.style.opacity = '1';
  
  // Set color based on damage
  if (damage >= 100) {
      damageIndicator.style.color = '#FF0000'; // Bright red for headshots
      damageIndicator.style.fontSize = '64px';
  } else if (damage >= 40) {
      damageIndicator.style.color = '#FF4500'; // Orange-red for body shots
  } else {
      damageIndicator.style.color = '#FFA500'; // Orange for limb shots
  }
  
  // Fade out after a delay
  setTimeout(() => {
      damageIndicator.style.opacity = '0';
  }, 800);
}

/**
* Updates all UI elements related to player status.
* @param {Player} player - The player instance.
*/
export function updatePlayerUI(player) {
  updateAmmoUI(player);
  updateHealthUI(player);
}