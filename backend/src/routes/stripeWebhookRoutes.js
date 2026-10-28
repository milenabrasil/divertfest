
const express = require('express');
const stripeWebhookController = require('../controllers/stripeWebhookController');

const router = express.Router();

router.post(
    '/',
    express.raw({ type: 'application/json' }),
    stripeWebhookController.receberWebhook
);

module.exports = router;
