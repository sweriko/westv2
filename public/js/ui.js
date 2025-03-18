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
      healthCounter.textContent = `Health: ${player.health}`;
    }
}
