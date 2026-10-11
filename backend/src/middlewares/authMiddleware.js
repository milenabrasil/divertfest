
const jwt = require('jsonwebtoken');
const AppError = require('./AppError');

const authMiddleware = (req, res, next) => {
    try {
        const authorization = req.headers.authorization;

        if (!authorization) {
            throw new AppError(
                'Token não informado',
                401
            );
        }

        const partes = authorization.split(' ');

        if (
            partes.length !== 2 ||
            partes[0] !== 'Bearer' ||
            !partes[1]
        ) {
            throw new AppError(
                'Formato do token inválido',
                401
            );
        }

        const token = partes[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (decoded.tipo !== 'cliente') {
            throw new AppError(
                'Acesso permitido apenas para clientes',
                403
            );
        }

        req.clienteId = decoded.id;

        next();

    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }

        return next(
            new AppError(
                'Token inválido ou expirado',
                401
            )
        );
    }
};

module.exports = authMiddleware;
