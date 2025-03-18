import { initScene, createNPC, updateNPC, updateFPS, scene } from './scene.js';
import { initInput } from './input.js';
import { SoundManager } from './soundManager.js';
import { Player } from './player.js';

let renderer, camera;
let player;
let npc;
let lastTime = 0;

function animate(time) {
  requestAnimationFrame(animate);
  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;

  // Update player (movement, recoil, etc.)
  player.update(deltaTime);

  // Update active bullets.
  for (let i = player.bulletsArray.length - 1; i >= 0; i--) {
    const bullet = player.bulletsArray[i];
    const stillActive = bullet.update(deltaTime, npc, scene);
    if (!stillActive) {
      scene.remove(bullet.mesh);
      player.bulletsArray.splice(i, 1);
    }
  }

  updateNPC(npc, deltaTime);
  updateFPS(renderer, camera, deltaTime);
  renderer.render(scene, camera);
}

function init() {
  try {
    const sceneSetup = initScene();
    camera = sceneSetup.camera;
    renderer = sceneSetup.renderer;

    const soundManager = new SoundManager();
    soundManager.loadSound("shot1", "sounds/shot1.mp3");
    soundManager.loadSound("shot2", "sounds/shot2.mp3");
    soundManager.loadSound("aimclick", "sounds/aimclick.mp3");
    soundManager.loadSound("shellejection", "sounds/shellejection.mp3");
    soundManager.loadSound("reloading", "sounds/reloading.mp3");
    
    player = new Player(scene, camera, soundManager);
    npc = createNPC(scene);
    initInput(renderer, player, soundManager);

    animate(0);
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

init();
