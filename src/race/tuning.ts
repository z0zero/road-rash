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
  /** Riders who overlap at a speed difference under this (m/s) bump apart; above it, the faster rider crashes. */
  bumpSpeedLimit: 8,
  /** A bump shoves each rider sideways, away from the other, at this speed (m/s)... */
  bumpShove: 2.5,
  /** ...and a shove dies away at this rate (1/s). */
  shoveDecay: 6,
  /** Attacks reach riders at most this far along the track (m); how far sideways depends on the attack. */
  attackReachAlong: 2,
  /**
   * Each attack: seconds from throwing it to its strike, and from the strike
   * until the next can be thrown; how far sideways it reaches (m); the stamina
   * it takes when it lands; and how fast it shoves its target sideways (m/s).
   */
  attacks: {
    punch: { windUp: 0.12, recovery: 0.2, reachAcross: 1.8, stamina: 18, shove: 0 },
    kick: { windUp: 0.25, recovery: 0.3, reachAcross: 1.8, stamina: 6, shove: 6 },
    "club-swing": { windUp: 0.3, recovery: 0.35, reachAcross: 2.4, stamina: 30, shove: 0 },
  },
  /** A fresh rider's stamina; it runs down to 0... */
  fullStamina: 100,
  /** ...and recovers at this much per second... */
  staminaRecovery: 6,
  /** ...once the rider has gone this many seconds without being hit. */
  staminaRecoveryDelay: 2,
  /** A crashed rider is thrown along the road, tumbling to a stop over this many seconds... */
  tumbleSeconds: 1.2,
  /** ...while their bike drops and grinds to a halt sooner, slowing by this much (m/s²), so it ends up behind them... */
  slideDeceleration: 80,
  /** ...and the sideways motion of both dies away at this rate (1/s). */
  sideSlideDecay: 3,
  /** On foot, a rider runs back to their bike at this speed (m/s)... */
  runSpeed: 6,
  /** ...and full steering turns them this far (radians) from running straight at it. */
  runTurn: Math.PI / 3,
  /** A rider on foot this close to their bike (m) gets back on it... */
  remountReach: 0.5,
  /** ...riding off at this speed (m/s)... */
  remountSpeed: 5,
  /** ...with at least this much stamina. */
  remountStamina: 50,
  /** A bike in perfect condition; at 0 it is wrecked. */
  fullCondition: 100,
  /** Every crash takes this much off the bike's condition... */
  crashConditionLoss: 6,
  /** ...plus this much per km/h of the impact speed. */
  crashConditionLossPerKmh: 0.15,
  cops: {
    /** Where the cops wait on the shoulder for the player to pass, in metres from the start line. */
    waitingPoints: [1800, 4500],
    /** 66 m/s is about 238 km/h: faster than any rider's bike. */
    topSpeed: 66,
    /** A fresh cop's stamina. */
    fullStamina: 150,
    /** A cop rides to a rider who crashes this many metres from it or closer... */
    bustingRange: 80,
    /** ...and busts them on getting this close to them (m) before they are back on their bike. */
    bustingReach: 2.5,
  },
} as const;
