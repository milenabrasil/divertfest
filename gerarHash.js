const bcrypt = require('bcrypt');

const gerarHash = async () => {
    const senha = 'adminadmin';

    const hash = await bcrypt.hash(senha, 10);

    console.log(hash);
};

gerarHash();