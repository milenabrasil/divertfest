const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const administradorRepository =
    require('../repositories/administradorRepository');

const AppError = require('../middlewares/AppError');

const login = async (usuario, senha) => {
    if (!usuario || !senha) {
        throw new AppError(
            'Usuário e senha são obrigatórios',
            400
        );
    }

    const administrador =
        await administradorRepository.buscarPorUsuario(
            usuario.trim()
        );

    if (!administrador) {
        throw new AppError(
            'Usuário ou senha inválidos',
            401
        );
    }

    const senhaCorreta = await bcrypt.compare(
        senha,
        administrador.senha
    );

    if (!senhaCorreta) {
        throw new AppError(
            'Usuário ou senha inválidos',
            401
        );
    }

    const token = jwt.sign(
        {
            id: administrador.id,
            tipo: 'administrador'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '1d'
        }
    );

    return {
        token,
        administrador: {
            id: administrador.id,
            usuario: administrador.usuario,
            nome: administrador.nome
        }
    };
};

module.exports = {
    login
};