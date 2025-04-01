/**
 * Bullet Trajectory Configuration with fixed values
 * Implements trajectory adjustment with preset values
 */

// No UI initialization since we're using fixed values

// Initialize trajectory adjustments
window.bulletTrajectoryAdjustment = {
  horizontal: 0.01,
  vertical: -0.02
};

/**
 * Applies the trajectory adjustment to a bullet direction
 * @param {THREE.Vector3} direction - The original bullet direction 
 * @returns {THREE.Vector3} - The adjusted direction
 */
export function adjustBulletTrajectory(direction) {
  // Always apply the adjustment even without UI
  const adjustedDirection = direction.clone();
  
  // Create adjustment vector based on camera's orientation
  if (window.localPlayer && window.localPlayer.camera) {
    const camera = window.localPlayer.camera;
    
    // Get right vector (for horizontal adjustment)
    const rightVector = new THREE.Vector3();
    rightVector.setFromMatrixColumn(camera.matrix, 0);
    
    // Get up vector (for vertical adjustment)
    const upVector = new THREE.Vector3();
    upVector.setFromMatrixColumn(camera.matrix, 1);
    
    // Apply horizontal adjustment (left/right)
    if (window.bulletTrajectoryAdjustment.horizontal !== 0) {
      const horizontalAdjustment = rightVector.multiplyScalar(window.bulletTrajectoryAdjustment.horizontal);
      adjustedDirection.add(horizontalAdjustment);
    }
    
    // Apply vertical adjustment (up/down)
    if (window.bulletTrajectoryAdjustment.vertical !== 0) {
      const verticalAdjustment = upVector.multiplyScalar(window.bulletTrajectoryAdjustment.vertical);
      adjustedDirection.add(verticalAdjustment);
    }
    
    // Normalize the direction
    adjustedDirection.normalize();
  }
  
  return adjustedDirection;
}

// Create a path visualizer if in debug mode
export function createBulletPathVisualizer() {
  // Path visualizer removed
  return null;
} 