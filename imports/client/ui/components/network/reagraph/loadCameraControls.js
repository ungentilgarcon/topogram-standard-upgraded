let cachedCameraControls;
let installAttempted = false;

export default async function ensureCameraControls(runtimeReagraph) {
  if (cachedCameraControls !== undefined) {
    return cachedCameraControls;
  }
  try {
    const mod = await import('camera-controls');
    const CameraControls = mod && (mod.default || mod.CameraControls || mod);
    if (!CameraControls) {
      cachedCameraControls = null;
      return cachedCameraControls;
    }
    if (!installAttempted) {
      installAttempted = true;
      try {
        const maybeThree = runtimeReagraph && (runtimeReagraph.THREE || runtimeReagraph.three || runtimeReagraph.THREEJS);
        if (maybeThree && typeof CameraControls.install === 'function') {
          CameraControls.install({ THREE: maybeThree });
        }
      } catch (installErr) {
        // installation is best-effort, ignore errors so the caller can still access the module
      }
    }
    cachedCameraControls = CameraControls;
    return cachedCameraControls;
  } catch (err) {
    console.warn('ensureCameraControls: failed to load camera-controls', err);
    cachedCameraControls = null;
    return cachedCameraControls;
  }
}
