
const jwt = require('jsonwebtoken');
const AppError = require('./AppError');

const adminAuthMiddleware = (req, res, next) => {
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

        if (decoded.tipo !== 'administrador') {
            throw new AppError(
                'Acesso permitido apenas para administradores',
                403
            );
        }

        req.administradorId = decoded.id;

        next();
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError(
            'Token inválido ou expirado',
            401
        );
    }
};

module.exports = adminAuthMiddleware;
