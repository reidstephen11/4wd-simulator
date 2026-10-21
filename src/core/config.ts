/** Engine-level constants (gameplay tuning lives in src/data). */
export const PHYSICS_HZ = 60;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
/** Never simulate more than this many steps per rendered frame (avoids a death spiral). */
export const MAX_STEPS_PER_FRAME = 5;
/** The most simulated time per frame (s) while the loop catches up (browser tests). */
export const CATCH_UP_SECONDS = 1;
export const SAVE_KEY = '4wdsim.save.v1';
