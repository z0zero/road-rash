/**
 * The race's tuning: the spec's initial numbers, adjustable in play-testing.
 * Metres, seconds and metres per second throughout.
 */
export const TUNING = {
  /** 62.5 m/s is 225 km/h. */
  topSpeed: 62.5,
  /** Full-throttle acceleration from a standstill; it falls with the square of speed. */
  launchAcceleration: 8.6,
  /** Full throttle never accelerates less than this, so the bike reaches its top speed. */
  minimumDriveAcceleration: 2,
  /** Full brake, m/s². */
  braking: 12,
  /** Coasting slows the bike by this, plus `airDrag` times speed squared (m/s²). */
  rollingResistance: 0.3,
  airDrag: 0.00035,
  /** Full steering moves the bike sideways at up to this (m/s)... */
  maxSidewaysSpeed: 8,
  /** ...less this much at top speed, falling with the square of speed... */
  sidewaysSpeedLossAtTopSpeed: 3.5,
  /** ...and at most this many times the bike's speed, so a stopped bike can't slide sideways. */
  steeringPerSpeed: 1.6,
  /** How quickly steering reaches its sideways speed (1/s). */
  steeringResponse: 10,
  /** Curves push the bike outwards at this many seconds times speed squared times curvature (m/s). */
  curvePush: 0.3,
  /** Off the road, a bike faster than this (m/s, 65 km/h)... */
  offRoadTopSpeed: 18,
  /** ...slows by this much (m/s²) whatever the throttle, and can't speed up past it. */
  offRoadDeceleration: 16,
} as const;
