const express = require('express');

const brinquedoController = require('../controllers/brinquedoController');
const fotoBrinquedoController = require('../controllers/fotoBrinquedoController');

const router = express.Router();

// Brinquedos
router.get('/', brinquedoController.listar);
router.post('/', brinquedoController.criar);

router.get('/:id', brinquedoController.listarPorId);
router.patch('/:id', brinquedoController.atualizar);
router.patch('/:id/status', brinquedoController.alterarStatus);

// Fotos
router.get('/:id/fotos', fotoBrinquedoController.listar);
router.post('/:id/fotos', fotoBrinquedoController.adicionar);
router.patch('/:id/fotos/:idFoto', fotoBrinquedoController.atualizar);
router.delete('/:id/fotos/:idFoto', fotoBrinquedoController.excluir);

module.exports = router;