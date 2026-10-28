
const express = require('express');
const clienteController = require('../controllers/clienteController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Cadastrar cliente
router.post('/', clienteController.criar);

// Login do cliente
router.post('/login', clienteController.login);

// Consultar perfil
router.get(
    '/perfil',
    authMiddleware,
    clienteController.buscarPerfil
);

// Atualizar perfil
router.patch(
    '/perfil',
    authMiddleware,
    clienteController.atualizarPerfil
);

// Alterar senha
router.patch(
    '/alterar-senha',
    authMiddleware,
    clienteController.alterarSenha
);

module.exports = router;
