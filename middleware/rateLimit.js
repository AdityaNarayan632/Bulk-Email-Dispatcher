const redis = require("../config/redis");

module.exports = async (req, res, next) => {
  try {
    const userId = req.user.id; // set by JWT middleware
    const key = `rate_limit:${userId}`;

    const requests = await redis.incr(key);

    // Set expiry of 60 seconds on first request
    if (requests === 1) {
      await redis.expire(key, 60);
    }

    if (requests > 10) {
      return res.status(429).json({
        error:
          "Too many requests. Please wait before submitting another campaign.",
        limit: 10,
        window: "60 seconds",
      });
    }

    next();
  } catch (err) {
    next(); // fail open — don't block if Redis has issues
  }
};
