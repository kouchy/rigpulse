/**
 * RigPulse — Demo Mode Configuration (js/demo.js)
 *
 * ENABLE_DEMO:
 * - true  : RigPulse runs 100% in client-side interactive demo mode (serverless / mock API).
 *           Ideal for GitHub Pages, static hosting, or standalone browser preview.
 * - false : RigPulse runs in standard production mode with the PHP/SSH backend.
 *           (Passing '?demo=1' in the URL still activates demo mode on-demand).
 *
 * DEMO_BAR:
 * - true  : Shows the classic floating control pill at the bottom of the screen (Host/Diag/Lock chips).
 * - false : Hides the bottom bar and instead displays a diagonal "DEMO" watermark behind the logo,
 *           for a cleaner presentation (used for the deployed GitHub Pages demo).
 */
export const ENABLE_DEMO = false;
export const DEMO_BAR = false;
