
const reservaRepository = require('../repositories/reservaRepository');

const expirarReservas = async () => {
    const reservas =
        await reservaRepository.expirarReservasVencidas();

    if (reservas.length > 0) {
        console.log(
            `${reservas.length} reserva(s) expirada(s) automaticamente`
        );
    }

    return reservas;
};

module.exports = {
    expirarReservas
};
