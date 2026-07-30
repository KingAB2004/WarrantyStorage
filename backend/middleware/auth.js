const jwt = require('jsonwebtoken');
const UnauthenticatedError = require('../errors/UnauthenticatedError');

const authenticationMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthenticatedError('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded info to request
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return next(new UnauthenticatedError('Not authorized to access this route'));
  }
};

module.exports = authenticationMiddleware;
