const jwt = require('jsonwebtoken');
const AppError = require('./AppError');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        throw new AppError('Token não informado', 401);
    }

    const [tipo, token] = authHeader.split(' ');

    if (tipo !== 'Bearer' || !token) {
        throw new AppError('Token inválido', 401);
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.clienteId = decoded.id;

        next();
    } catch (error) {
        throw new AppError('Token inválido ou expirado', 401);
    }
};

module.exports = authMiddleware;