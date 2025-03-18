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
  