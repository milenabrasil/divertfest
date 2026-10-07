const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    return res.status(statusCode).json({
        mensagem: err.message || 'Erro interno do servidor'
    });
};

module.exports = errorHandler;